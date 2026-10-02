import { initVoucherModule } from "../voucher-engine.js";
export async function init(){return initVoucherModule({fixedCategory:"Purchase",fixedVoucherType:"Purchase Return / Debit Note"});}