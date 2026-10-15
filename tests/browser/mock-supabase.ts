// Browser-contract fixture, NOT a replacement for Supabase Auth/RLS integration.
// It listens only on loopback and has no outbound requests or production credentials.
import { createServer } from "node:http";

const a = "10000000-0000-0000-0000-000000000001";
const b = "10000000-0000-0000-0000-000000000002";
const users = {
  existing: { id: "00000000-0000-0000-0000-000000000001", email: "existing@example.test", user_metadata: { professional_name: "Existing Professional" } },
  platform: { id: "00000000-0000-0000-0000-000000000004", email: "platform@example.test", user_metadata: {} },
  new: { id: "00000000-0000-0000-0000-000000000002", email: "new@example.test", user_metadata: { professional_name: "" } },
};
function token(user: typeof users[keyof typeof users], aal="aal1") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: "authenticated", aal })}.test-signature`;
}
function session(user: typeof users[keyof typeof users], aal="aal1") {
  return { access_token: token(user,aal), refresh_token: "browser-fixture-refresh", token_type: "bearer", expires_in: 3600, user: { ...user, aud: "authenticated", role: "authenticated", app_metadata: {}, factors: user.id===users.platform.id ? [{ id:"platform-factor",factor_type:"totp",status:"verified",friendly_name:"Test MFA" }] : [], email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } };
}
const certificateId = "20000000-0000-0000-0000-000000000001";
const publicId = "30000000-0000-0000-0000-000000000001";
let currentStatus = "Active";
let internalReason: string | null = null;
let publicReason: string | null = null;
const revokedAt = "2026-10-12T00:00:00Z";
type Version={ id:string;account_id:string;company_name:string;professional_details:string;logo_asset_id:string|null;created_at:string;origin:string;approved_by:string|null };
const baseline:Version={ id:"40000000-0000-0000-0000-000000000001",account_id:a,company_name:"Test Issuer",professional_details:"",logo_asset_id:null,created_at:"2026-10-01T00:00:00Z",origin:"baseline",approved_by:null };
let current={ ...baseline };let versions=[current];let brandingRequests:Record<string,unknown>[]=[];
let finalizeFailure=false;let storageDeletes=0;let logoCounter=0;const logos=new Map<string,Buffer>();let logoPath="";
let accountAccess="active";let accessRevision=0;let accessReason:string|null=null;
let platformAudit:Record<string,unknown>[]=[];let editingPermissions:Record<string,unknown>[]=[];
const billingPlanId="70000000-0000-0000-0000-000000000001";
const billingTerms={name:"Browser baseline plan",description:"Fixture only",eligibility:["individual","organization"],audience:"standard",billing_period:"monthly",custom_days:30,price_minor:99900,renewal_price_minor:99900,currency:"INR",currency_exponent:2,included_seats:5,extra_seat_price_minor:39900,max_seats:10,certificate_limit:20,trial_days:7,visible:true,features:[],starts_at:null,ends_at:null};
let billingPlans=[{id:billingPlanId,version_id:"71000000-0000-0000-0000-000000000001",status:"active",revision:2,terms:{...billingTerms}}];
let billingOffers:Record<string,unknown>[]=[];let billingQuotes:Record<string,unknown>[]=[];
let publicContact={support_email:"help@certverify.example",support_phone:"+91 90000 00000",website_url:"https://example.com/help",help_text:"Weekday assistance"};
let billingEntitled=true;let billingStatus="active";let billingTrialUsed=false;let billingUsed=0;let billingCancelled=false;
let billingPeriod:Record<string,unknown>|null={id:"90000000-0000-0000-0000-000000000001",plan_id:billingPlanId,plan_version_id:"71000000-0000-0000-0000-000000000001",name:billingTerms.name,billing_period:"monthly",starts_at:"2026-10-01T00:00:00Z",ends_at:"2026-11-01T00:00:00Z",licensed_seats:5,certificate_limit:20,payment_status:"waived"};
let billingHistory:Record<string,unknown>[]=[];let billingPayments:Record<string,unknown>[]=[];
function resetBilling(){billingPlans=[{id:billingPlanId,version_id:"71000000-0000-0000-0000-000000000001",status:"active",revision:2,terms:{...billingTerms}}];billingOffers=[];billingQuotes=[];billingEntitled=true;billingStatus="active";billingTrialUsed=false;billingUsed=0;billingCancelled=false;billingPeriod={id:"90000000-0000-0000-0000-000000000001",plan_id:billingPlanId,plan_version_id:"71000000-0000-0000-0000-000000000001",name:billingTerms.name,billing_period:"monthly",starts_at:"2026-10-01T00:00:00Z",ends_at:"2026-11-01T00:00:00Z",licensed_seats:5,certificate_limit:20,payment_status:"waived"};billingHistory=[];billingPayments=[];}
function platformAccounts() {
 const common={ created_at:"2026-10-01T00:00:00Z",subscription_source:null,subscription_observed_at:null,certificate_count:1,active_certificates:1,inactive_certificates:0,revoked_certificates:0,last_issued_at:"2026-10-01T00:00:00Z" };
 return [{...common,id:a,name:current.company_name,account_code:"A",account_type:"organization",access_status:accountAccess,revision:accessRevision,subscription_status:"unknown",member_count:2},
 {...common,id:b,name:"Organization B",account_code:"B",account_type:"individual",access_status:"active",revision:0,subscription_status:"trial",member_count:1}];
}
function audit(action:string,details:Record<string,unknown>={}) { platformAudit.unshift({ id:`event-${platformAudit.length+1}`,actor_id:users.platform.id,action,account_id:a,subject_id:a,occurred_at:new Date().toISOString(),details }); }
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  response.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-certverify-account,prefer,accept,range,content-profile,accept-profile");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  const chunks:Buffer[]=[];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw=Buffer.concat(chunks);
  const body = request.headers["content-type"]?.includes("application/json") && raw.length ? JSON.parse(raw.toString()) : {};
  const url = new URL(request.url!, "http://127.0.0.1:54329");
  let subject = "";let aal="aal1";
  try { const claims=JSON.parse(Buffer.from((request.headers.authorization ?? "").split(".")[1] ?? "", "base64url").toString());subject=claims.sub;aal=claims.aal; } catch {}
  const user = subject === users.platform.id ? users.platform : subject === users.new.id ? users.new : users.existing;
  response.setHeader("Content-Type", "application/json");
  function json(value: unknown, status = 200) { response.writeHead(status).end(JSON.stringify(value)); }
  if (url.pathname === "/test/reset") { currentStatus = "Active"; internalReason = null; publicReason = null; current={...baseline};versions=[current];brandingRequests=[];logos.clear();resetBilling();accountAccess="active";accessRevision=0;accessReason=null;platformAudit=[];editingPermissions=[];finalizeFailure=false;storageDeletes=0;json({}); return; }
  if (url.pathname === "/test/finalize-failure") { finalizeFailure=true;json({});return; }
  if (url.pathname === "/test/storage-state") { json({ objects:logos.size,deletes:storageDeletes });return; }
  if(url.pathname==="/test/billing-reset"){billingEntitled=false;billingStatus="unsubscribed";billingPeriod=null;json({});return;}
  if(url.pathname==="/test/billing-expire"){billingEntitled=false;billingStatus="expired";billingUsed=20;json({});return;}
  if (url.pathname === "/health") { json({ status: "fixture" }); return; }
  if (url.pathname === "/auth/v1/token") { json(session(body.email === users.platform.email ? users.platform : body.email === users.new.email ? users.new : users.existing)); return; }
  if (url.pathname === "/auth/v1/verify") {
    if (body.token_hash === "expired") { json({ code: "otp_expired", message: "Expired fixture" },403); return; }
    json(session(body.token_hash === "new" ? users.new : users.existing)); return;
  }
  if (url.pathname === "/auth/v1/user") { json({ ...session(user,aal).user, ...(body.data ? { user_metadata: body.data } : {}) }); return; }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204).end(); return; }
  if (url.pathname === "/auth/v1/recover" || url.pathname === "/auth/v1/signup" || url.pathname === "/auth/v1/otp") { json({}); return; }
  // Account-security enrollment substitute only; real TOTP remains a hosted gate.
  if (url.pathname === "/auth/v1/factors" && request.method === "POST") { json({id:"account-factor",type:"totp",totp:{qr_code:"<svg xmlns='http://www.w3.org/2000/svg'/>",secret:"fixture-only-totp-secret",uri:"otpauth://totp/fixture"}});return; }
  if (url.pathname.endsWith("/account-factor/challenge")) { json({id:"fixture-account-challenge",type:"totp",expires_at:Math.floor(Date.now()/1000)+60});return; }
  if (url.pathname.endsWith("/account-factor/verify")) { if(body.code!=="123456"){json({message:"Invalid code"},422);return;}json(session(user,"aal2"));return; }
  if (url.pathname.endsWith("/platform-factor/challenge")) { json({ id:"fixture-challenge",type:"totp",expires_at:Math.floor(Date.now()/1000)+60 });return; }
  if (url.pathname.endsWith("/platform-factor/verify")) { if(body.code!=="123456") { json({ message:"Invalid authenticator code",code:"mfa_verification_failed" },422);return; }json(session(users.platform,"aal2"));return; }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const path=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?certverify-branding\//,""));
    if (request.method==="DELETE") { storageDeletes++;json([]);return; }
    if (request.method==="POST") { logos.set(path,raw);json({ Key:path });return; }
    const bytes=logos.get(path);if (!bytes) { json({ message:"Object missing" },404);return; }
    response.setHeader("Content-Type","image/webp");response.writeHead(200).end(bytes);return;
  }
  const rpc=url.pathname.replace("/rest/v1/rpc/","");
  if (rpc==="cv_invitation_setup_required") {
    json(user.id===users.new.id);return;
  }
  if (rpc==="cv_team_member_directory") {
    const all=[
      {id:"70000000-0000-0000-0000-000000000001",user_id:users.existing.id,email:users.existing.email,role:"owner",status:"active",joined_at:"2026-10-01T00:00:00Z"},
      {id:"70000000-0000-0000-0000-000000000002",user_id:users.new.id,email:users.new.email,role:"member",status:"active",joined_at:"2026-10-02T00:00:00Z"},
    ];
    json(user.id===users.new.id ? all.filter(x=>x.user_id===user.id):all);return;
  }
  if (rpc==="cv_prepare_invitation") { json("63000000-0000-0000-0000-000000000001");return; }
  if (rpc==="cv_revoke_invitation") { json(true);return; }
  if (rpc==="cv_platform_identity") { json(user.id===users.platform.id);return; }
  if (rpc==="cv_is_platform_admin") { json(user.id===users.platform.id && aal==="aal2");return; }
  if(rpc==="cv_subscription_status"){
    const owner=user.id===users.existing.id;
    json({account_id:a,account_type:"organization",can_cancel:owner,can_manage:owner&&accountAccess==="active",entitled:billingEntitled,status:billingStatus,period:billingPeriod ? {...billingPeriod,certificates_created:billingUsed,remaining_certificates:Math.max(0,20-billingUsed)}:null,allocated_seats:2,cancel_at_period_end:billingCancelled,trial_used:billingTrialUsed,requests:owner?billingQuotes:[],history:owner?billingHistory:[],payments:owner?billingPayments:[]});return;
  }
  if(rpc==="cv_platform_payment_report"){if(user.id!==users.platform.id||aal!=="aal2"){json({message:"MFA required"},403);return;}json({attempts:[],total:0,page:body.p_page});return;}
  if(rpc==="cv_pricing_catalog"){json(billingPlans.filter(p=>p.status==="active"&&p.terms.visible));return;}
  if(rpc==="cv_public_login_information") {
    json({
      plans: billingPlans.filter((p)=>p.status==="active"&&p.terms.visible),
      offers: [{name:"Public trial offer",code:"WELCOME",kind:"free_trial",value:0,cycles:1,trial_days:7,currency:null,currency_exponent:2,ends_at:null}],
      contact:publicContact,
    });
    return;
  }
  if(rpc==="cv_platform_contact_settings" || rpc==="cv_save_platform_contact_settings") {
    if(user.id!==users.platform.id || aal!=="aal2"){json({message:"MFA required"},403);return;}
    if(rpc==="cv_save_platform_contact_settings"){publicContact={...publicContact,...body.p_contact};audit("platform.contact_updated");json(true);return;}
    json(publicContact);return;
  }
  if(["cv_platform_billing_catalog","cv_save_plan","cv_save_offer","cv_set_catalog_status","cv_platform_subscription_report","cv_admin_grant_subscription"].includes(rpc)){
    if(user.id!==users.platform.id||aal!=="aal2"){json({message:"Denied"},403);return;}
    if(rpc==="cv_platform_billing_catalog"){json({plans:billingPlans,offers:billingOffers});return;}
    if(rpc==="cv_save_plan"){
      const old=billingPlans.find(p=>p.id===body.p_id);
      if(old){if(old.revision!==body.p_revision){json({message:"Stale"},409);return;}old.terms=body.p_terms;old.revision++;old.version_id="71000000-0000-0000-0000-000000000099";json(old.id);return;}
      const id=`70000000-0000-0000-0000-${String(billingPlans.length+1).padStart(12,"0")}`;billingPlans.push({id,version_id:id,status:"draft",revision:1,terms:body.p_terms});json(id);return;
    }
    if(rpc==="cv_save_offer"){const id="72000000-0000-0000-0000-000000000001";billingOffers.push({id,version_id:id,status:"draft",revision:1,code:body.p_code,terms:body.p_terms,redemption_count:0});json(id);return;}
    if(rpc==="cv_set_catalog_status"){const item=body.p_kind==="plan" ? billingPlans.find(p=>p.id===body.p_id):billingOffers.find(o=>o.id===body.p_id);if(item){item.status=body.p_status;item.revision=Number(item.revision)+1;}json(true);return;}
    if(rpc==="cv_platform_subscription_report"){json({total:1,page:body.p_page,accounts:[{id:a,name:current.company_name,status:billingStatus,payment_intents:billingPayments.length,period:billingPeriod ? {...billingPeriod,plan_snapshot:billingTerms,certificates_created:billingUsed}:null,requests:billingQuotes.filter(q=>q.status!=="quoted")}],history:billingHistory,audit:[]});return;}
    if(rpc==="cv_admin_grant_subscription"){billingEntitled=true;billingStatus="active";json({status:"applied"});return;}
  }
  if(["cv_quote_subscription","cv_accept_subscription","cv_subscription_action"].includes(rpc)){
    if(user.id!==users.existing.id||request.headers["x-certverify-account"]!==a){json({message:"Owner required"},403);return;}
    if(rpc==="cv_quote_subscription"){
      const plan=billingPlans.find(p=>p.id===body.p_plan);if(!plan){json({message:"Plan unavailable"},409);return;}
      if(body.p_intent==="trial"&&(billingTrialUsed||billingEntitled)){json({message:"Trial unavailable"},409);return;}
      const terms={...plan.terms};let amount=(body.p_intent==="renewal"?terms.renewal_price_minor:terms.price_minor)+Math.max(0,body.p_seats-terms.included_seats)*terms.extra_seat_price_minor;
      let offerTerms=null;
      if(body.p_coupon){const campaign=billingOffers.find(o=>o.code===body.p_coupon.toUpperCase()&&o.status==="active");if(!campaign){json({message:"Coupon unavailable"},409);return;}offerTerms=campaign.terms as {kind:string;value:number};amount=offerTerms.kind==="percentage"?amount-Math.floor(amount*offerTerms.value/10000):Math.max(0,amount-offerTerms.value);}
      if(body.p_intent==="trial")amount=0;
      const id=`80000000-0000-0000-0000-${String(billingQuotes.length+1).padStart(12,"0")}`;
      const quote={id,expires_at:new Date(Date.now()+1800000).toISOString(),quote:{plan_id:plan.id,plan_version_id:plan.version_id,plan:terms,licensed_seats:body.p_seats,regular_renewal_minor:terms.renewal_price_minor+Math.max(0,body.p_seats-terms.included_seats)*terms.extra_seat_price_minor,discounted_cycles:offerTerms?1:0,list_amount_minor:terms.price_minor,amount_due_minor:amount,currency:terms.currency,trial_days:body.p_intent==="trial"?terms.trial_days:0,offer_terms:offerTerms},status:"quoted",intent:body.p_intent,seats:body.p_seats,scheduled_for:null};billingQuotes.push(quote);json(quote);return;
    }
    if(rpc==="cv_accept_subscription"){
      const q=billingQuotes.find(q=>q.id===body.p_quote);if(!q){json({message:"Quote unavailable"},409);return;}const terms=(q.quote as {plan:typeof billingTerms;trial_days:number;amount_due_minor:number}).plan;const details=q.quote as {trial_days:number;amount_due_minor:number};
      if(details.amount_due_minor>0){q.status="awaiting_payment";billingPayments.push({id:q.id,amount_minor:details.amount_due_minor,currency:terms.currency,provider:"unconfigured",status:"pending",created_at:new Date().toISOString()});json({status:"awaiting_payment"});return;}
      q.status="applied";billingEntitled=true;billingTrialUsed=details.trial_days>0;billingStatus=billingTrialUsed?"trial":"active";billingPeriod={id:"90000000-0000-0000-0000-000000000002",plan_id:(q.quote as {plan_id:string}).plan_id,name:terms.name,billing_period:terms.billing_period,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+604800000).toISOString(),licensed_seats:q.seats,certificate_limit:terms.certificate_limit,payment_status:"no_payment_required"};json({status:"applied"});return;
    }
    if(body.p_action==="cancel_request"){const q=billingQuotes.find(q=>q.id===body.p_request);if(q)q.status="cancelled";}
    else{billingCancelled=body.p_action==="cancel_renewal";billingStatus=billingCancelled?"non_renewing":billingEntitled?"active":"expired";}json(true);return;
  }
  if (rpc==="cv_customer_account_states") { json([{account_id:a,status:accountAccess},{account_id:b,status:"active"}]);return; }
  if (["cv_platform_overview","cv_platform_accounts","cv_platform_account","cv_platform_set_account_access","cv_platform_audit"].includes(rpc)) {
    if (user.id!==users.platform.id || aal!=="aal2") { json({message:"Denied"},403);return; }
    const accounts=platformAccounts();
    if(rpc==="cv_platform_overview") { json({accounts:2,individual_accounts:1,organization_accounts:1,users:3,certificates:2,active_certificates:2,inactive_certificates:0,revoked_certificates:0,access_statuses:{[accountAccess]:1},subscription_statuses:{unknown:1,trial:1},issuance_daily:[{date:"2026-10-01",count:2}],generated_at:new Date().toISOString()});return; }
    if(rpc==="cv_platform_accounts") {
      const filtered=accounts.filter((account)=>(!body.p_type || account.account_type===body.p_type) && (!body.p_status || account.access_status===body.p_status) && (!body.p_subscription || account.subscription_status===body.p_subscription) && (!body.p_search || (account.name+" existing@example.test").toLowerCase().includes(body.p_search.toLowerCase())));
      json({accounts:filtered.slice((body.p_page-1)*body.p_limit,body.p_page*body.p_limit),total:filtered.length,page:body.p_page,limit:body.p_limit});return;
    }
    if(rpc==="cv_platform_account") {
      const account=accounts.find((row)=>row.id===body.p_account);if(!account){json(null);return;}
      json({account,access:{status:account.access_status,revision:account.revision,reason:accessReason,changed_by:users.platform.id,changed_at:"2026-10-01T00:00:00Z"},subscription:null,members:[{id:"member-owner",user_id:users.existing.id,email:users.existing.email,role:"owner",status:"active",joined_at:"2026-10-01T00:00:00Z",email_confirmed_at:"2026-10-01T00:00:00Z"}],member_page:body.p_member_page,total_members:1,activity:[{id:"activity-1",actor_id:users.existing.id,action:"certificate.created",occurred_at:"2026-10-01T00:00:00Z",subject_id:certificateId}]});return;
    }
    if(rpc==="cv_platform_set_account_access") {
      if(body.p_revision!==accessRevision || !body.p_reason?.trim()) {json({message:"Conflict"},409);return;}
      const previous=accountAccess;accountAccess=body.p_status;accessReason=body.p_reason;accessRevision++;
      audit("account.access_changed",{previous_status:previous,status:accountAccess,reason:accessReason});json({status:accountAccess,revision:accessRevision});return;
    }
    if(rpc==="cv_platform_audit") { json({total:platformAudit.length,page:body.p_page,events:platformAudit});return; }
  }
  if (rpc==="cv_current_branding") { json(current);return; }
  if (rpc==="cv_certificate_issuer") { json(baseline);return; }
  if (rpc==="cv_reserve_logo") {
    if (user.id!==users.existing.id) { json({ message:"Denied" },403);return; }
    const id=`50000000-0000-0000-0000-${String(++logoCounter).padStart(12,"0")}`;logoPath=`${a}/${id}.webp`;json({ id,path:logoPath });return;
  }
  if (rpc==="cv_finalize_logo") { if (finalizeFailure) { json({ message:"Ambiguous finalization" },503);return; }json(true);return; }
  if (rpc==="cv_logo_access") { json(user.id!==users.new.id ? `${a}/${body.p_asset}.webp` : null);return; }
  if (rpc==="cv_public_logo_path") { json(null);return; }
  if (rpc==="cv_request_branding") {
    if (user.id!==users.existing.id || request.headers["x-certverify-account"]!==a) { json({ message:"Denied" },403);return; }
    if (brandingRequests.some((r)=>r.status==="pending")) { json({ message:"Already pending" },409);return; }
    const id="60000000-0000-0000-0000-000000000001";
    brandingRequests.push({ id,account_id:a,base_version_id:current.id,company_name:body.p_name,professional_details:body.p_details,logo_asset_id:body.p_logo,explanation:body.p_explanation,requested_by:user.id,status:"pending",created_at:new Date().toISOString() });json(id);return;
  }
  if (rpc==="cv_platform_branding_requests") {
    const filtered=brandingRequests.filter((r)=>!body.p_status || r.status===body.p_status || (body.p_status==="open" && ["pending","needs_information","permission_granted"].includes(String(r.status))));
    json({reviews:filtered.map((r)=>({request:r,current,fields:["company_name"],history:versions,permissions:editingPermissions,members:[{user_id:users.existing.id,email:users.existing.email,role:"owner"}]})),total:filtered.length,page:body.p_page,limit:body.p_limit});return;
  }
  if (rpc==="cv_platform_branding_queue") {
    json(brandingRequests.map((r)=>({ request:r,current,fields:["company_name"],history:versions,permissions:editingPermissions })));return;
  }
  if (rpc==="cv_revoke_branding_permission") {
    const permission=editingPermissions.find((p)=>p.id===body.p_permission);if(permission) permission.revoked_at=new Date().toISOString();
    brandingRequests.forEach((r)=>{r.status="pending";});audit("branding.permission_revoked");json(true);return;
  }
  if (rpc==="cv_review_branding") {
    if (user.id!==users.platform.id || aal!=="aal2") { json({ message:"Denied" },403);return; }
    const r=brandingRequests.find((item)=>item.id===body.p_request);
    if (!r || r.status!=="pending") { json({ message:"Not pending" },409);return; }
    if(body.p_action==="grant") {r.status="permission_granted";editingPermissions.push({id:"permission-1",user_id:body.p_user,fields:body.p_fields,expires_at:body.p_expires,used_at:null,revoked_at:null});audit("branding.grant");json(true);return;}
    r.status=body.p_action==="approve" ? "approved" : "rejected";r.decision_reason=body.p_reason;
    if (body.p_action==="approve") { current={...current,id:"40000000-0000-0000-0000-000000000002",company_name:String(r.company_name),professional_details:String(r.professional_details),logo_asset_id:r.logo_asset_id as string|null,origin:"approved",approved_by:user.id};versions.push(current); }
    json(true);return;
  }
  if (url.pathname==="/rest/v1/cv_branding_versions") { json(versions);return; }
  if (url.pathname==="/rest/v1/cv_branding_requests") { json(user.id===users.existing.id ? brandingRequests : []);return; }
  if (url.pathname === "/rest/v1/rpc/cv_list_accounts") {
    json([{ id: a, account_name: "Organization A", account_code: "A", account_type: "organization", role: user.id === users.new.id ? "member" : "owner" },
      { id: b, account_name: "Organization B", account_code: "B", account_type: "organization", role: "member" }]); return;
  }
  if (url.pathname === "/rest/v1/rpc/cv_accept_invitation") { json(b); return; }
  if (url.pathname === "/rest/v1/rpc/cv_change_certificate_status") {
    currentStatus = body.p_status; internalReason = body.p_reason; publicReason = body.p_public_reason;
    json({ id:certificateId,status:currentStatus }); return;
  }
  if (url.pathname === "/rest/v1/rpc/cv_public_certificate") {
    if (body.p_reference === "unavailable-fixture") { json({ message:"Fixture unavailable" },503); return; }
    if (![publicId,"active-fixture","inactive-fixture","revoked-fixture"].includes(body.p_reference)) { json(null); return; }
    const status = body.p_reference === publicId ? currentStatus : body.p_reference === "revoked-fixture" ? "Revoked" : body.p_reference === "inactive-fixture" ? "Inactive" : "Active";
    json({ public_verification_id:publicId,certificate_id:"CV-FIXTURE-1",issuer_name:"Test Issuer",issued_at:"2026-10-01T00:00:00Z",status,
      revoked_at:status === "Revoked" ? revokedAt : null,public_revocation_reason:status === "Revoked" ? publicReason || "Withdrawn by issuer" : null,
      fields:[{ id:"public-field",field_name:"Public title",field_type:"text",field_value:"Public certificate record" }] }); return;
  }
  if (url.pathname === "/rest/v1/account_invitations" && url.searchParams.get("select") === "requires_setup") {
    json({ requires_setup: true });return;
  }
  if (url.pathname === "/rest/v1/certificates" && url.searchParams.get("id") === `eq.${certificateId}`) {
    json({ id:certificateId,certificate_id:"CV-FIXTURE-1",status:currentStatus,created_at:"2026-10-01T00:00:00Z",template_id:null,template_name:"Test template",public_verification_id:publicId,
      revoked_at:currentStatus === "Revoked" ? revokedAt : null,revoked_by:users.existing.id,
      revocation_reason:internalReason,public_revocation_reason:publicReason,revocation_previous_status:currentStatus === "Revoked" ? "Active" : null }); return;
  }
  if (url.pathname.startsWith("/rest/v1/")) { response.setHeader("Content-Range", "*/0"); json([]); return; }
  json({ message: "Unsupported fixture operation" },404);
});
server.listen(54329, "127.0.0.1");
