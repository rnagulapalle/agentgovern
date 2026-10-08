import {NextRequest} from "next/server";
import {database} from "@/lib/durable/database";
import {authenticate} from "@/lib/durable/service";
import {body,credential,failure,sameOrigin} from "@/lib/durable/http";
import {RecordOnboarding} from "@/lib/connectors/catalog";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(r:NextRequest){try{const db=database(),actor=await authenticate(db,credential(r));return Response.json(await new RecordOnboarding(db).list(actor),{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
export async function POST(r:NextRequest){try{sameOrigin(r);const db=database(),actor=await authenticate(db,credential(r));return Response.json(await new RecordOnboarding(db).change(actor,await body(r)),{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
