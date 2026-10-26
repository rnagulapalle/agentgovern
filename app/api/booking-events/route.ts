import { receiveBooking } from '../../../lib/workspace/booking-receiver';
export const runtime='nodejs';
// Installation capability remains closed pending migration/grant and native acceptance.
export async function POST(request:Request){return receiveBooking(request);}
