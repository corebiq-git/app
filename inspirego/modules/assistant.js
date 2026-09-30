const conversation = document.getElementById("assistantConversation");
const form = document.getElementById("assistantForm");
const promptInput = document.getElementById("assistantPrompt");
const status = document.getElementById("assistantStatus");
const placeholderPrompts = [
  "Ask about upgrading your COREBIQ plan...",
  "Need more from your business workspace?",
  "Ask us about COREBIQ plans and features..."
];

function animatePlaceholder(){
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    promptInput.placeholder = placeholderPrompts[0];
    return;
  }
  let promptIndex = 0;
  let characterIndex = 0;
  let deleting = false;
  const tick = ()=>{
    if(promptInput.value || document.activeElement === promptInput){
      window.setTimeout(tick,220);
      return;
    }
    const currentPrompt = placeholderPrompts[promptIndex];
    characterIndex += deleting ? -1 : 1;
    promptInput.placeholder = currentPrompt.slice(0,characterIndex);
    let delay = deleting ? 32 : 58;
    if(!deleting && characterIndex >= currentPrompt.length){
      deleting = true;
      delay = 1050;
    }else if(deleting && characterIndex <= 0){
      deleting = false;
      promptIndex = (promptIndex + 1) % placeholderPrompts.length;
    }
    window.setTimeout(tick,delay);
  };
  tick();
}

function addMessage(text,kind){
  const message = document.createElement("div");
  message.className = `assistant-message${kind ? ` is-${kind}` : ""}`;
  message.textContent = text;
  conversation.append(message);
  conversation.scrollTop = conversation.scrollHeight;
}

function addUpgradeMessage(){
  const message = document.createElement("div");
  message.className = "assistant-message assistant-upgrade-message";
  const copy = document.createElement("p");
  copy.textContent = "AI assistance is available with an upgraded COREBIQ plan. Contact us to choose the right plan for your business.";
  const actions = document.createElement("div");
  actions.className = "assistant-upgrade-actions";
  const contactMessage = "Hi, I would like to upgrade my COREBIQ plan. Please share the available plans.";
  const whatsappUrl = `https://wa.me/919946151111?text=${encodeURIComponent(contactMessage)}`;
  const emailUrl = `mailto:support@corebiq.com?subject=${encodeURIComponent("COREBIQ plan upgrade")}&body=${encodeURIComponent(contactMessage)}`;
  const addContactLink = (iconName,label,href,openNewTab=false)=>{
    const link = document.createElement("a");
    link.className = `assistant-contact-link assistant-contact-${iconName}`;
    link.href = href;
    link.title = label;
    link.setAttribute("aria-label",label);
    if(openNewTab){
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    const icon = document.createElement("span");
    icon.className = "material-symbols-rounded";
    icon.textContent = iconName;
    link.append(icon);
    actions.append(link);
  };
  addContactLink("chat","WhatsApp COREBIQ support at +91 99461 51111",whatsappUrl,true);
  addContactLink("call","Call COREBIQ support at +91 99461 51111","tel:+919946151111");
  addContactLink("email","Email COREBIQ support at support@corebiq.com",emailUrl);
  message.append(copy,actions);
  conversation.append(message);
  window.COREBIQ?.renderIcons(actions);
  conversation.scrollTop = conversation.scrollHeight;
}

export async function init(){
  document.getElementById("assistantGenerate")?.addEventListener("click",()=>promptInput.focus());
  animatePlaceholder();

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if(!prompt) return;
    document.querySelector(".assistant-welcome")?.remove();
    addMessage(prompt,"user");
    promptInput.value = "";
    addUpgradeMessage();
    status.textContent = "Choose WhatsApp, call, or email to contact COREBIQ about plans.";
    promptInput.focus();
  });
}
