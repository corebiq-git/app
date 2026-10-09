export function formatCurrency(value,currency="INR",options={}){
  const amount=Number(value)||0;
  try{
    return new Intl.NumberFormat(undefined,{style:"currency",currency,...options}).format(amount);
  }catch{
    return `${currency} ${amount.toFixed(2)}`;
  }
}
