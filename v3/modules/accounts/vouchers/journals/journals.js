import { initVoucherModule } from "../voucher-engine.js";
export async function init(){return initVoucherModule({fixedCategory:"Journal",fixedVoucherType:"Journal Voucher"});}