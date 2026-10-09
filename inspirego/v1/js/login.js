import { createAccount, observeAuth, resetPassword, signIn } from "./firebase-service.js?v=7";

const form = document.getElementById("authForm");
const nameInput = document.getElementById("authName");
const nameGroup = document.getElementById("authNameGroup");
const emailInput = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const passwordToggle = document.getElementById("passwordToggle");
const rememberInput = document.getElementById("rememberMe");
const feedback = document.getElementById("authFeedback");
const submitButton = document.getElementById("authSubmit");
let mode = "signin";

function showError(error){
  const messages = {
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/email-already-in-use":"An account already exists for this email.",
    "auth/weak-password":"Use a password with at least 6 characters.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/operation-not-allowed":"Email/password sign-in is not enabled in Firebase Authentication.",
    "auth/too-many-requests":"Too many attempts. Wait a while and try again.",
    "auth/network-request-failed":"Firebase Authentication could not be reached. Check your connection."
  };
  feedback.classList.remove("is-success");
  feedback.textContent = messages[error.code] || error.message || "Authentication failed. Check Firebase Authentication settings.";
  feedback.hidden = false;
}

function setMode(nextMode){
  mode = nextMode;
  const createMode = mode === "create";
  document.getElementById("authTitle").textContent = createMode ? "Create your account" : "Welcome back";
  document.getElementById("authDescription").textContent = createMode ? "Create a secure account for your COREBIQ workspace." : "Sign in to continue to your workspace.";
  submitButton.textContent = createMode ? "Create account" : "Sign in";
  document.getElementById("authModeToggle").textContent = createMode ? "Back to sign in" : "Create an account";
  passwordInput.autocomplete = createMode ? "new-password" : "current-password";
  nameGroup.hidden = !createMode;
  nameInput.required = createMode;
  feedback.hidden = true;
}

observeAuth(user=>{
  if(user) window.location.replace("./index.html");
},error=>showError(error));

document.getElementById("authModeToggle").addEventListener("click",()=>setMode(mode === "signin" ? "create" : "signin"));

passwordToggle.addEventListener("click",()=>{
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.setAttribute("aria-label",showPassword ? "Hide password" : "Show password");
  passwordToggle.setAttribute("aria-pressed",String(showPassword));
  passwordToggle.innerHTML = `<i data-lucide="${showPassword ? "eye-off" : "eye"}"></i>`;
  window.lucide?.createIcons();
  passwordInput.focus();
});

document.getElementById("passwordReset").addEventListener("click",async()=>{
  const email = emailInput.value.trim();
  if(!email){
    feedback.textContent = "Enter your email address first.";
    feedback.hidden = false;
    emailInput.focus();
    return;
  }
  try{
    await resetPassword(email);
    feedback.textContent = "If an account exists for this address, a reset link has been sent.";
    feedback.classList.add("is-success");
    feedback.hidden = false;
  }catch(error){ showError(error); }
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  feedback.hidden = true;
  if(mode === "create" && !nameInput.value.trim()){
    nameInput.setCustomValidity("Enter your name to create an account.");
    nameInput.reportValidity();
    nameInput.focus();
    return;
  }
  nameInput.setCustomValidity("");
  submitButton.disabled = true;
  submitButton.textContent = mode === "create" ? "Creating account..." : "Signing in...";
  try{
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if(mode === "create") await createAccount(email,password,nameInput.value.trim(),rememberInput.checked);
    else await signIn(email,password,rememberInput.checked);
    window.location.replace("./index.html");
  }catch(error){ showError(error); }
  finally{
    submitButton.disabled = false;
    submitButton.textContent = mode === "create" ? "Create account" : "Sign in";
  }
});
