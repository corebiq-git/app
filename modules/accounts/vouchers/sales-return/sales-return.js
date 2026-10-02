import { initVoucherModule } from "../voucher-engine.js";
export async function init(){return initVoucherModule({fixedCategory:"Sales",fixedVoucherType:"Sales Return / Credit Note"});}