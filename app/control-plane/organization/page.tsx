import { CompanyOrganization } from "@/components/control-plane/company-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
import { notFound } from "next/navigation";
export default function OrganizationPage(){if(process.env.LOOPLABS_DEPLOYMENT_PROFILE!==scriptDemoProfile)notFound();return <CompanyOrganization/>;}
