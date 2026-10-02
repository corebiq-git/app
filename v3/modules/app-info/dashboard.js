import { getCompany, listRecords } from "../../js/firebase-service.js?v=6";

function escapeHtml(value){
	return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}

function totalAmount(records){
	return records.reduce((total,record)=>total + Number(record.amount || 0),0);
}

function formatCurrency(value,currency){
	return new Intl.NumberFormat("en-IN",{style:"currency",currency,maximumFractionDigits:0}).format(value);
}

function recordDate(record){
	const value = record.date || record.createdAt || record.updatedAt;
	if(!value) return 0;
	if(typeof value.toDate === "function") return value.toDate().getTime();
	if(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)){
		const [year,month,day] = value.split("-").map(Number);
		return new Date(year,month-1,day).getTime();
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateKey(value){
	if(!value) return "";
	if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const date=typeof value.toDate==="function"?value.toDate():new Date(value);
	return Number.isNaN(date.getTime())?"":`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function renderChequeReminders(cheques,currency){
	const todayKey=dateKey(new Date());
	const todayStart=new Date(`${todayKey}T00:00:00`);
	const active=cheques.filter(cheque=>["issued","deposited","bounced"].includes(String(cheque.status||"").toLowerCase()));
	const givenToday=cheques.filter(cheque=>dateKey(cheque.transactionDate||cheque.issueDate)===todayKey&&String(cheque.status||"").toLowerCase()!=="voided");
	const count=document.getElementById("todayGivenChequeCount");
	const list=document.getElementById("dashboardChequeList");
	const message=document.getElementById("chequeReminderMessage");
	if(!count||!list||!message) return;
	count.textContent=String(givenToday.length);
	try{count.title=new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(givenToday.reduce((sum,cheque)=>sum+Number(cheque.amount||0),0));}catch{count.title=String(givenToday.reduce((sum,cheque)=>sum+Number(cheque.amount||0),0));}
	const reminders=active.map(cheque=>{
		const chequeDate=dateKey(cheque.chequeDate||cheque.issueDate);
		const dueDate=chequeDate?new Date(`${chequeDate}T00:00:00`):null;
		const days=dueDate?Math.round((dueDate-todayStart)/86400000):null;
		return {...cheque,chequeDate,days};
	}).filter(cheque=>cheque.status.toLowerCase()==="bounced"||cheque.days!==null&&cheque.days<=7)
	.sort((left,right)=>(left.days??-1)-(right.days??-1)).slice(0,6);
	const overdue=reminders.filter(cheque=>cheque.days<0||cheque.status.toLowerCase()==="bounced").length;
	const dueSoon=reminders.filter(cheque=>cheque.days>=0&&cheque.days<=7).length;
	message.textContent=[overdue?`${overdue} cheque${overdue===1?"":"s"} overdue or bounced`:"",dueSoon?`${dueSoon} due within 7 days`:""].filter(Boolean).join(" · ")||"No cheque due-date reminders.";
	if(!reminders.length){list.innerHTML="";return;}
	list.innerHTML=reminders.map(cheque=>{
		const dueLabel=cheque.status.toLowerCase()==="bounced"?"Bounced":cheque.days<0?`Overdue ${Math.abs(cheque.days)}d`:cheque.days===0?"Due today":`Due in ${cheque.days}d`;
		return `<div class="dashboard-cheque-row"><span class="dashboard-cheque-date">${escapeHtml(dueLabel)}</span><strong>${escapeHtml(cheque.payee||"Payee not set")}</strong><span>${escapeHtml(cheque.purpose||"Cheque")}</span><time>${escapeHtml(cheque.chequeDate||"Date not set")}</time><b>${escapeHtml(formatCurrency(Number(cheque.amount)||0,currency))}</b></div>`;
	}).join("");
}

function isInPeriod(record,period,now,fiscalStartMonth){
	const timestamp = recordDate(record);
	if(!timestamp || timestamp > now.getTime()) return false;
	const date = new Date(timestamp);
	if(period === "today") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
	if(period === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
	let fiscalYear = now.getFullYear();
	if(now.getMonth() < fiscalStartMonth) fiscalYear--;
	return date >= new Date(fiscalYear,fiscalStartMonth,1);
}

export async function init(){
	const activity = document.getElementById("dashboardActivity");
	const periodSelect = document.getElementById("dashboardPeriod");
	const filterButton = document.getElementById("dashboardFilterButton");
	const filterLabel = document.getElementById("dashboardFilterLabel");
	const runningDate = document.getElementById("dashboardRunningDate");
	const now = new Date();
	const captions = {today:"Today",month:"Current month",fy:"Present FY"};
	if(runningDate) runningDate.textContent = `As on ${new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}).format(now)}`;
	let data;
	let fiscalStartMonth = 3;
	let currencyCode = "INR";
	let companyName = "";

	function renderDashboard(){
		if(!data || !activity?.isConnected) return;
		const period = periodSelect?.value || "today";
		const greeting = document.getElementById("dashboardGreeting");
		greeting.replaceChildren();
		const welcomePrefix = document.createElement("span");
		welcomePrefix.className = "dashboard-greeting-prefix";
		welcomePrefix.textContent = "Welcome back";
		greeting.append(welcomePrefix);
		if(companyName){
			const companyPrefix = document.createElement("span");
			companyPrefix.className = "dashboard-company-prefix";
			companyPrefix.textContent = " M/s ";
			const company = document.createElement("span");
			company.className = "dashboard-company-name";
			company.textContent = companyName;
			greeting.append(companyPrefix,company);
		}
		if(filterLabel) filterLabel.textContent = captions[period];
		const clients = data.clients.filter(record=>isInPeriod(record,period,now,fiscalStartMonth));
		const sales = data.sales.filter(record=>isInPeriod(record,period,now,fiscalStartMonth));
		const invoices = data.invoices.filter(record=>isInPeriod(record,period,now,fiscalStartMonth));
		const expenses = data.expenses.filter(record=>isInPeriod(record,period,now,fiscalStartMonth));
		const outstanding = invoices
			.filter(invoice=>!( ["paid","complete","completed"].includes(String(invoice.paymentStatus || "").toLowerCase())))
			.reduce((total,invoice)=>total + Number(invoice.amount || 0),0);
		document.getElementById("dashboardClientCount").textContent = String(clients.length);
		document.getElementById("dashboardSalesTotal").textContent = formatCurrency(totalAmount(sales),currencyCode);
		document.getElementById("dashboardOutstanding").textContent = formatCurrency(outstanding,currencyCode);
		document.getElementById("dashboardExpenseTotal").textContent = formatCurrency(totalAmount(expenses),currencyCode);
		document.querySelectorAll("[data-period-caption]").forEach(caption=>caption.textContent = captions[period]);
		renderChequeReminders(data.cheques||[],currencyCode);

		const recent = [
			...clients.map(record=>({record,type:"Client"})),
			...sales.map(record=>({record,type:"Sale"})),
			...invoices.map(record=>({record,type:"Invoice"})),
			...expenses.map(record=>({record,type:"Expense"}))
		].sort((left,right)=>recordDate(right.record)-recordDate(left.record)).slice(0,5);
		if(!recent.length){
			activity.className = "empty";
			activity.innerHTML = `<span class="material-symbols-rounded">history</span><p>No activity recorded for ${captions[period].toLowerCase()}.</p>`;
			window.COREBIQ?.renderIcons(activity);
			return;
		}
		activity.className = "dashboard-activity";
		activity.innerHTML = recent.map(({record,type})=>{
			const title = record.name || record.customer || record.category || record.reference || type;
			const timestamp = recordDate(record);
			const time = timestamp ? new Date(timestamp).toLocaleDateString() : "Date not set";
			return `<div class="dashboard-activity-row"><span class="material-symbols-rounded">${type === "Client" ? "person" : type === "Sale" ? "point_of_sale" : type === "Invoice" ? "receipt_long" : "payments"}</span><strong>${escapeHtml(type)}: ${escapeHtml(title)}</strong><time>${escapeHtml(time)}</time></div>`;
		}).join("");
		window.COREBIQ?.renderIcons(activity);
	}

	filterButton?.addEventListener("click",()=>{
		const willOpen = periodSelect.hidden;
		periodSelect.hidden = !willOpen;
		filterButton.setAttribute("aria-expanded",String(willOpen));
		if(willOpen) periodSelect.focus();
	});
	periodSelect?.addEventListener("change",()=>{
		periodSelect.hidden = true;
		filterButton?.setAttribute("aria-expanded","false");
		renderDashboard();
	});
	periodSelect?.addEventListener("blur",()=>{
		periodSelect.hidden = true;
		filterButton?.setAttribute("aria-expanded","false");
	});
	try{
		const [clients,sales,invoices,expenses,cheques] = await Promise.all([
			listRecords("clients"),
			listRecords("sales"),
			listRecords("invoices"),
			listRecords("expenses"),
			listRecords("cheques").catch(()=>[])
		]);
		if(!activity?.isConnected) return;
		data = {clients,sales,invoices,expenses,cheques};
		const company = await getCompany().catch(()=>null);
		companyName = String(company?.cmp_name || "").trim();
		currencyCode = String(company?.cmp_currency||"INR").toUpperCase();
		const month = company?.cmp_fy_start ? new Date(`${company.cmp_fy_start} 1, 2000`).getMonth() : 3;
		fiscalStartMonth = Number.isNaN(month) ? 3 : month;
		renderDashboard();
	}catch(error){
		if(!activity?.isConnected) return;
		["dashboardClientCount","dashboardSalesTotal","dashboardOutstanding","dashboardExpenseTotal"].forEach(id=>{
			document.getElementById(id).textContent = "--";
		});
		activity.innerHTML = `<span class="material-symbols-rounded">cloud_off</span><p>Could not load live dashboard data from Firebase.</p><small>${escapeHtml(error.message || "Check Firebase configuration and Firestore access rules.")}</small>`;
	}
}