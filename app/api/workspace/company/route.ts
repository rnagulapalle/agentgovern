import { NextRequest } from "next/server";
import { tenantContext } from "@/lib/workspace/tenant-context";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { companyDirectory } from "@/lib/workspace/company-profile";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{const {db,actor}=await tenantContext().authenticated(credential(request));return Response.json(await companyDirectory(db,actor),{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
export async function POST(request:NextRequest){try{sameOrigin(request);const {db,actor}=await tenantContext().authenticated(credential(request));return Response.json(await companyDirectory(db,actor,await body(request)),{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
