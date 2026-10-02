import { getCompany, listRecords } from "../../js/firebase-service.js?v=7";

const REPORT_SOURCES=[
  {key:"sales",label:"Sales"},
  {key:"invoices",label:"Invoices"},
  {key:"purchases",label:"Purchases"},
  {key:"expenses",label:"Expenses"},
  {key:"vouchers",label:"Vouchers"}
];

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}
function getDateValue(record){
  const value=record.date||record.transactionDate||record.createdAt;
  if(!value) return "";
  const date=typeof value.toDate==="function"?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?"":`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function getFinancialYear(dateString,startMonth){
  const date=dateString?new Date(`${dateString}T00:00:00`):new Date();
  const monthIndex=new Date(`${startMonth} 1, 2000`).getMonth();
  const startYear=date.getFullYear()-(date.getMonth()<monthIndex?1:0);
  return `${startYear}-${String((startYear+1)%100).padStart(2,"0")}`;
}
function formatCurrency(value,currency){
  try{return new Intl.NumberFormat("en-IN",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value)||0);}
  catch{return `${currency} ${Number(value||0).toFixed(2)}`;}
}
function recordAmount(record){
  const details=record.details||{};
  return Number(record.amount??details.grandTotal??details.noteTotal??details.netReceived??details.netPaid??details.netAmount??details.amount??details.totalCost??details.totalValue??0)||0;
}
function getRange(period,startMonth,fromValue,toValue){
  if(period==="custom") return {from:fromValue,to:toValue};
  const now=new Date();
  if(period==="month") return {from:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`,to:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`};
  const monthIndex=new Date(`${startMonth} 1, 2000`).getMonth();
  const currentStartYear=now.getFullYear()-(now.getMonth()<monthIndex?1:0);
  const startYear=currentStartYear-(period==="previous-fy"?1:0);
  const endYear=startYear+1;
  const endDate=new Date(endYear,monthIndex,0);
  return {from:`${startYear}-${String(monthIndex+1).padStart(2,"0")}-01`,to:`${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,"0")}-${String(endDate.getDate()).padStart(2,"0")}`};
}

export async function init(){
  const root=document.querySelector("#moduleContainer #reportsPage");
  if(!root) return;
  const rows=root.querySelector("#reportsRows");
  const feedback=root.querySelector("#reportsFeedback");
  let company={};
  let currency="INR";
  let fiscalStart="April";
  let records=[];

  function render(){
    const period=root.querySelector("#reportsPeriod").value;
    const sourceFilter=root.querySelector("#reportsSource").value;
    const range=getRange(period,fiscalStart,root.querySelector("#reportsFrom").value,root.querySelector("#reportsTo").value);
    const visible=records.filter(record=>
      (!sourceFilter||sourceFilter===record.sourceKey)&&
      (!range.from||record.date>=range.from)&&(!range.to||record.date<=range.to)&&
      String(record.status||"").toLowerCase()!=="cancelled"
    ).sort((left,right)=>right.date.localeCompare(left.date));
    const totals=Object.fromEntries(REPORT_SOURCES.map(source=>[source.key,visible.filter(record=>record.sourceKey===source.key&&record.currency===currency).reduce((sum,record)=>sum+record.amount,0)]));
    root.querySelector("#reportSales").textContent=formatCurrency(totals.sales,currency);
    root.querySelector("#reportInvoices").textContent=formatCurrency(totals.invoices,currency);
    root.querySelector("#reportPurchases").textContent=formatCurrency(totals.purchases,currency);
    root.querySelector("#reportExpenses").textContent=formatCurrency(totals.expenses,currency);
    root.querySelector("#reportsSubtitle").textContent=`${company.cmp_currency||"INR"} · ${period==="current-fy"?getFinancialYear(new Date().toISOString().slice(0,10),fiscalStart):period==="previous-fy"?"Previous financial year":"Selected period"}`;
    root.querySelector("#reportsCount").textContent=`${visible.length} records`;
    if(!visible.length){
      rows.innerHTML=`<tr><td colspan="7"><div class="empty"><span class="material-symbols-rounded">inbox</span><p>No financial activity for this period.</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      return;
    }
    rows.innerHTML=visible.map(record=>`<tr><td>${escapeHtml(record.date||"--")}</td><td>${escapeHtml(record.source)}</td><td>${escapeHtml(record.reference||"--")}</td><td>${escapeHtml(record.party||record.description||"--")}</td><td>${escapeHtml(record.financialYear||getFinancialYear(record.date,fiscalStart))}</td><td>${escapeHtml(formatCurrency(record.amount,record.currency))}</td><td>${escapeHtml(record.status||"--")}</td></tr>`).join("");
  }

  async function refresh(){
    feedback.hidden=true;
    try{
      const names=["sales","invoices","purchases","expenses","transactions"];
      const [companyResult,...collectionResults]=await Promise.allSettled([getCompany(),...names.map(name=>listRecords(name))]);
      company=companyResult.status==="fulfilled"?companyResult.value||{}:{};
      currency=String(company.cmp_currency||"INR").toUpperCase();
      fiscalStart=company.cmp_fy_start||"April";
      const failed=[];
      records=collectionResults.flatMap((result,index)=>{
        if(result.status!=="fulfilled"){failed.push(names[index]);return [];}
        const source=names[index]==="transactions"?"vouchers":names[index];
        const label=REPORT_SOURCES.find(item=>item.key===source)?.label||source;
        return result.value.map(record=>({
          id:record.id,sourceKey:source,source:label,date:getDateValue(record),reference:record.documentNo||record.invoiceNumber||record.reference||record.invoice||"",
          party:record.partyName||record.customer||record.supplier||record.party||"",description:record.description||record.narration||record.voucherType||record.type||"",
          amount:recordAmount(record),currency:String(record.currency||currency).toUpperCase(),financialYear:record.financialYear||"",status:record.status||record.paymentStatus||"",record
        }));
      });
      if(failed.length){feedback.textContent=`Some sources could not be loaded: ${failed.join(", ")}.`;feedback.hidden=false;}
      if(!root.querySelector("#reportsFrom").value&&!root.querySelector("#reportsTo").value){
        const range=getRange("current-fy",fiscalStart);
        root.querySelector("#reportsFrom").value=range.from;
        root.querySelector("#reportsTo").value=range.to;
      }
      render();
    }catch(error){
      rows.innerHTML=`<tr><td colspan="7"><div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load financial reports.</p></div></td></tr>`;
      feedback.textContent=error.message||"Check Firebase configuration and access rules.";
      feedback.hidden=false;
    }
  }

  root.querySelector("#reportsPeriod").addEventListener("change",event=>{
    const custom=event.target.value==="custom";
    root.querySelector("#reportsFrom").disabled=!custom;
    root.querySelector("#reportsTo").disabled=!custom;
    if(!custom){
      const range=getRange(event.target.value,fiscalStart);
      root.querySelector("#reportsFrom").value=range.from;
      root.querySelector("#reportsTo").value=range.to;
    }
    render();
  });
  ["reportsFrom","reportsTo","reportsSource"].forEach(id=>root.querySelector(`#${id}`).addEventListener("change",render));
  root.querySelector("#reportsRefresh").addEventListener("click",refresh);
  root.querySelector("#reportsExport").addEventListener("click",()=>{
    const visible=[...rows.querySelectorAll("tr")].filter(row=>row.cells.length===7).map(row=>[...row.cells].map(cell=>cell.textContent.trim()));
    const csvEscape=value=>{const text=String(value??"");return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
    const csv=[["Date","Source","Reference","Party / Description","Financial Year","Amount","Status"],...visible].map(row=>row.map(csvEscape).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`financial-report-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
  });
  await refresh();
}