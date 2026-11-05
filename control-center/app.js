(() => {
"use strict";
const cfg=window.ACADEMIA_CONTROL_CONFIG,client=window.supabase?.createClient;
const $=id=>document.getElementById(id);
const db=client(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"academia-control-center"}});
const state={page:"overview",users:[],pageNumber:1,hasMore:false,selected:null,academies:[],studentId:"",adminRole:null,permissions:{},platformAdmins:[]};
const roles={teacher:"مدرس / مالك",supervisor:"مشرف",student:"طالب",guardian:"ولي أمر",general:"حساب عام"};
const actions={user_created:"إنشاء حساب",user_updated:"تعديل بيانات",password_reset_by_admin:"تغيير كلمة مرور",user_blocked:"إيقاف حساب",user_unblocked:"إعادة تفعيل",notice_sent:"إرسال تنبيه",broadcast_notice_sent:"تنبيه جماعي",platform_admin_created:"إضافة مدير مساعد",platform_admin_permissions_updated:"تعديل صلاحيات مدير",platform_admin_access_revoked:"إلغاء صلاحية مدير"};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v?new Date(v).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"}):"—";
function status(message,error=false){$("status").textContent=message||"";$("status").style.color=error?"#b64b5a":"#16805e"}
function toast(message){const area=$("toast-area")||$("content");if(!area)return;area.insertAdjacentHTML("afterbegin",'<p class="notice">'+esc(message)+'</p>');}
async function api(action,payload={}){const {data,error}=await db.functions.invoke("academia-control-center",{body:{action,...payload}});if(error){let m=error.message||"تعذر الاتصال";try{const x=await error.context.json();m=x.error||m}catch{}throw new Error(m)}if(data?.error)throw new Error(data.error);return data}
function loginView(message=""){$("login").hidden=false;$("dashboard").hidden=true;if(message)status(message,true)}
async function enter(session){
 $("login").hidden=true;$("dashboard").hidden=false;
 $("admin-name").textContent=session.user.user_metadata?.full_name||session.user.email||"مدير المنصة";
 try{
  const access=await api("my_access");state.adminRole=access.admin_role;state.permissions=access.permissions||{};
  const p=state.permissions,superAdmin=state.adminRole==="super_admin";
  const allowed={overview:superAdmin||p.view_dashboard,users:superAdmin||p.view_accounts,notices:superAdmin||p.send_notices||p.view_notices,audit:superAdmin||p.view_audit,team:superAdmin};
  document.querySelectorAll("nav [data-page]").forEach(b=>{b.hidden=!allowed[b.dataset.page]});
  if($("add-admin"))$("add-admin").hidden=!superAdmin;
  if($("self-password-button"))$("self-password-button").hidden=!superAdmin;
  if($("broadcast-form"))$("broadcast-form").hidden=!(superAdmin||p.send_notices);
  const first=["overview","users","notices","audit","team"].find(name=>allowed[name]);
  if(!first)throw new Error("هذا الحساب لا يملك صلاحية لعرض أي قسم. تواصل مع مدير المنصة.");
  await navigate(first);
 }catch(e){await db.auth.signOut();loginView(e.message)}
}
async function loadOverview(){const response=await api("overview");const c=response.counts||{};$("teachers").textContent=(c.teachers||0).toLocaleString("ar-EG");$("students").textContent=(c.students||0).toLocaleString("ar-EG");$("guardians").textContent=(c.guardians||0).toLocaleString("ar-EG");$("supervisors").textContent=(c.supervisors||0).toLocaleString("ar-EG");if($("unread-notices"))$("unread-notices").textContent=(c.unreadNotices||0).toLocaleString("ar-EG");if($("last-updated"))$("last-updated").textContent=fmt(new Date().toISOString())}
function showPage(name){state.page=name;["overview","users","notices","audit","team"].forEach(p=>{const el=$(p);if(el)el.hidden=p!==name});document.querySelectorAll("nav [data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===name));const title=$("page-title");if(title)title.textContent=({overview:"نظرة عامة",users:"إدارة الحسابات",notices:"الإنذارات والتنبيهات",audit:"سجل العمليات",team:"فريق الإدارة"})[name]||"مركز التحكم"}
async function navigate(name){
 const p=state.permissions||{},superAdmin=state.adminRole==="super_admin";
 const allowed={overview:superAdmin||p.view_dashboard,users:superAdmin||p.view_accounts,notices:superAdmin||p.send_notices||p.view_notices,audit:superAdmin||p.view_audit,team:superAdmin};
 if(!allowed[name])throw new Error("ليس لديك صلاحية لفتح هذا القسم.");
 showPage(name);
 if(name==="overview")await loadOverview();if(name==="users")await loadUsers(1);
 if(name==="notices"&&(superAdmin||p.view_notices))await loadNotices();
 if(name==="audit")await loadAudit();if(name==="team")await loadAdmins();
}
async function loadUsers(page=state.pageNumber){const r=await api("list_users",{page,perPage:100});state.users=r.users||[];state.pageNumber=r.page;state.hasMore=r.hasMore;$("page-label").textContent="الصفحة "+r.page;$("prev").disabled=r.page<=1;$("next").disabled=!r.hasMore;drawUsers()}
function drawUsers(){
 const q=$("search").value.trim().toLowerCase();
 const list=state.users.filter(u=>[u.email,u.phone,u.full_name,...(u.roles||[])].join(" ").toLowerCase().includes(q));
 const canManage=state.adminRole==="super_admin"||state.permissions.manage_accounts;
 $("user-rows").innerHTML=list.length?list.map(u=>{
  const blocked=u.banned_until&&new Date(u.banned_until)>new Date();
  const fakeEmail=String(u.email||"").endsWith("@login.academia.invalid");
  const shownEmail=fakeEmail?"دخول بالكود المخصص":(u.email||"بدون بريد");
  const chips=(u.roles||["general"]).map(r=>'<span class="role-chip">'+esc(roles[r]||r)+'</span>').join(" ");
  return '<tr><td><b>'+esc(u.full_name||"بدون اسم")+'</b><br><small dir="ltr">'+esc(shownEmail)+'</small><br><small dir="ltr">'+esc(u.phone||"")+'</small></td><td>'+chips+'</td><td>'+esc(fmt(u.created_at))+'</td><td>'+esc(fmt(u.last_sign_in_at))+'</td><td>'+(blocked?'<span class="state-bad">موقوف</span>':'<span class="state-good">نشط</span>')+(u.email_confirmed?'<br><small class="state-good">بريد مؤكد</small>':'<br><small class="state-warn">بريد غير مؤكد</small>')+'</td><td>'+(u.is_admin?'<span class="muted">إدارة محمية</span>':(canManage?'<button class="row-btn" data-manage="'+esc(u.id)+'">إدارة</button>':'<span class="muted">عرض فقط</span>'))+'</td></tr>';
 }).join(""):'<tr><td colspan="6" class="empty">لا توجد نتائج في هذه الصفحة.</td></tr>';
 if($("[data-create]"))$("[data-create]").hidden=!canManage;
}
function openManage(id){
 const u=state.users.find(x=>x.id===id);if(!u||u.is_admin)return;state.selected=u;
 const blocked=u.banned_until&&new Date(u.banned_until)>new Date(),email=String(u.email||"");
 const loginLabel=email.endsWith("@login.academia.invalid")?"دخول بالكود المخصص":(email||"بدون بريد");
 let view='<section class="panel manage-panel"><div class="manage-header"><div><div class="eyebrow">إدارة حساب المستخدم</div><h3>'+esc(u.full_name||"حساب المستخدم")+'</h3><p class="muted">'+esc(loginLabel)+'</p></div><button type="button" class="button ghost" id="close-manage">إغلاق</button></div><div class="manage-grid">';
 view+='<section class="manage-section"><h4>البيانات الأساسية</h4><form id="edit-form" class="manage-form"><label>الاسم الكامل<input name="full_name" required minlength="2" maxlength="100" value="'+esc(u.full_name||"")+'"></label><label>البريد الإلكتروني<input name="email" type="email" dir="ltr" value="'+esc(email.endsWith("@login.academia.invalid")?"":email)+'" '+(email.endsWith("@login.academia.invalid")?"disabled":"")+'></label><button class="button primary" type="submit">حفظ البيانات</button></form></section>';
 view+='<section class="manage-section"><h4>كلمة مرور الحساب</h4><form id="pass-form" class="manage-form"><label>كلمة مرور جديدة<input name="new_password" type="password" minlength="6" maxlength="72" required placeholder="6 أحرف أو أرقام على الأقل"></label><button class="button primary" type="submit">تعيين كلمة المرور</button></form><small class="form-hint">الحد الأقصى 72 حرفًا.</small></section>';
 view+='<section class="manage-section"><h4>إيقاف الحساب أو إعادة تفعيله</h4><form id="ban-form" class="manage-form"><label>مدة الإيقاف<select name="duration_hours"><option value="0">إعادة تفعيل الحساب</option><option value="1">ساعة</option><option value="24">24 ساعة</option><option value="168">7 أيام</option><option value="720">30 يومًا</option><option value="876000">إيقاف طويل المدى</option></select></label><button class="button danger" type="submit">'+(blocked?"تحديث الإيقاف / التفعيل":"إيقاف الحساب")+'</button></form><small class="form-hint">الإيقاف يمنع تسجيل الدخول، ولا يحذف بيانات الحساب.</small></section>';
 view+='<section class="manage-section"><h4>إرسال تنبيه لهذا الحساب</h4><form id="notice-form" class="manage-notice-form"><label>عنوان التنبيه<input name="title" required maxlength="120" placeholder="عنوان واضح للتنبيه"></label><label>الأهمية<select name="severity"><option value="info">معلومة</option><option value="warning" selected>تحذير</option><option value="critical">إنذار مهم</option></select></label><label class="span-all">نص التنبيه<textarea name="message" required maxlength="4000" rows="4" placeholder="اكتب رسالة التنبيه…"></textarea></label><button class="button primary" type="submit">إرسال التنبيه</button></form><small class="form-hint">سيظهر التنبيه داخل صندوق إشعارات الحساب المستهدف.</small></section></div><p class="form-hint">لا نعرض كلمة المرور الحالية ولا نسجل كلمة المرور الجديدة في سجل العمليات.</p></section>';
 $("content").innerHTML=view;
 $("close-manage").onclick=()=>{$("content").innerHTML="";};
 $("edit-form").onsubmit=e=>runForm(e,async f=>{await api("update_user",{user_id:u.id,full_name:f.get("full_name"),email:f.get("email")});await loadUsers();$("content").innerHTML="";});
 $("pass-form").onsubmit=e=>runForm(e,async f=>{if(!confirm("تعيين كلمة مرور جديدة لهذا الحساب؟"))return;await api("set_password",{user_id:u.id,new_password:f.get("new_password")});e.target.reset();});
 $("ban-form").onsubmit=e=>runForm(e,async f=>{const h=Number(f.get("duration_hours"));if(!confirm(h===0?"إعادة تفعيل هذا الحساب؟":"إيقاف هذا الحساب؟"))return;await api("set_ban",{user_id:u.id,duration_hours:h});await loadUsers();$("content").innerHTML="";});
 $("notice-form").onsubmit=e=>runForm(e,async f=>{const result=await api("send_notice",{user_id:u.id,title:f.get("title"),message:f.get("message"),severity:f.get("severity")});e.target.reset();toast(result.message||"تم إرسال التنبيه.");if(state.permissions.view_notices||state.adminRole==="super_admin")await loadNotices();});
}
async function runForm(e,fn){e.preventDefault();const b=e.submitter;const label=b?.textContent||"";if(b){b.disabled=true;b.textContent="جارٍ التنفيذ…"}try{await fn(new FormData(e.target));toast("تمت العملية بنجاح.")}catch(err){toast(err.message)}finally{if(b){b.disabled=false;b.textContent=label}}}
async function loadNotices(){
 const r=await api("list_notices");
 $("notice-rows").innerHTML=(r.notices||[]).map(n=>'<tr><td><b>'+esc(n.recipient_name||"مستخدم")+'</b><br><small dir="ltr">'+esc(n.recipient_email||"")+'</small></td><td><b>'+esc(n.title)+'</b><br>'+esc(n.message)+'</td><td>'+esc(n.severity)+'</td><td>'+esc(fmt(n.created_at))+'</td><td>'+(n.read_at?"تمت القراءة":"لم تُقرأ")+'</td></tr>').join("")||'<tr><td colspan="5" class="empty">لا توجد تنبيهات حتى الآن.</td></tr>';
}
async function loadAudit(){const r=await api("list_audit");$("audit-rows").innerHTML=(r.logs||[]).map(x=>'<tr><td>'+esc(actions[x.action]||x.action)+'</td><td><code>'+esc(x.target_user_id||"—")+'</code></td><td>'+esc(JSON.stringify(x.details||{}))+'</td><td>'+esc(fmt(x.created_at))+'</td></tr>').join("")||'<tr><td colspan="4" class="empty">لا توجد عمليات مسجلة.</td></tr>'}
async function loadAcademies(){const r=await api("list_academies");state.academies=r.academies||[];$("academy-select").innerHTML='<option value="">اختر الأكاديمية</option>'+state.academies.map(a=>'<option value="'+esc(a.owner_id)+'">'+esc(a.name)+'</option>').join("")}
async function openCreate(){state.studentId="";$("create-form").reset();$("student-id").value="";$("student-selected").textContent="لم يتم اختيار طالب.";$("student-options").innerHTML="";$("create-status").textContent="";await loadAcademies();toggleRole();$("create-modal").showModal()}
function toggleRole(){const r=$("account-role").value;$("academy-wrap").hidden=r!=="supervisor";$("student-wrap").hidden=!["student","guardian"].includes(r);$("phone-wrap").hidden=r!=="supervisor"}
async function searchStudents(q){if(q.trim().length<2){$("student-options").innerHTML="";return}try{const r=await api("search_students",{query:q});$("student-options").innerHTML=(r.students||[]).map(s=>'<button type="button" class="row-btn student-pick" data-id="'+esc(s.id)+'" data-name="'+esc(s.name)+'" data-code="'+esc(s.code)+'">'+esc(s.name)+' · '+esc(s.code)+'</button>').join("")||'<small class="muted">لا توجد نتائج.</small>';document.querySelectorAll(".student-pick").forEach(b=>b.onclick=()=>{state.studentId=b.dataset.id;$("student-id").value=b.dataset.id;$("student-selected").textContent="تم اختيار: "+b.dataset.name+" · "+b.dataset.code;$("student-options").innerHTML=""})}catch(e){toast(e.message)}}
$("logout").onclick=async()=>{await db.auth.signOut();location.reload()};
$("login-submit").addEventListener("click",()=>{});
document.querySelectorAll("nav [data-page]").forEach(b=>b.onclick=()=>navigate(b.dataset.page).catch(e=>toast(e.message)));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>navigate(b.dataset.go).catch(e=>toast(e.message)));
document.querySelectorAll("[data-create]").forEach(b=>b.onclick=()=>openCreate().catch(e=>toast(e.message)));
$("refresh").onclick=()=>navigate(state.page).catch(e=>toast(e.message));
$("prev").onclick=()=>loadUsers(Math.max(1,state.pageNumber-1)).catch(e=>toast(e.message));
$("next").onclick=()=>loadUsers(state.pageNumber+1).catch(e=>toast(e.message));
$("search").oninput=drawUsers;
$("user-rows").onclick=e=>{const b=e.target.closest("[data-manage]");if(b)openManage(b.dataset.manage)};
$("account-role").onchange=toggleRole;
let timer=null;$("student-query").oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>searchStudents(e.target.value),300)};
$("create-form").onsubmit=e=>runForm(e,async f=>{const role=f.get("account_role");if(["student","guardian"].includes(role)&&!state.studentId)throw new Error("اختَر الطالب أولًا.");if(role==="supervisor"&&!f.get("owner_id"))throw new Error("اختَر الأكاديمية أولًا.");const r=await api("create_user",{full_name:f.get("full_name"),email:f.get("email"),password:f.get("password"),account_role:role,owner_id:f.get("owner_id"),student_id:state.studentId,phone:f.get("phone")});$("create-modal").close();toast(r.message);await loadOverview();await navigate("users")});
$("generate").onclick=()=>{const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";const v=new Uint32Array(18);crypto.getRandomValues(v);$("create-form").elements.password.value=Array.from(v,n=>chars[n%chars.length]).join("")};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("[data-close-create]").forEach(b=>b.onclick=()=>$("create-modal").close());
db.auth.getSession().then(({data})=>data.session?enter(data.session):loginView()).catch(()=>loginView());
db.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT")loginView();if(event==="PASSWORD_RECOVERY"&&session)enter(session).then(()=>openOwnPassword()).catch(e=>toast(e.message))});
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}

function makeRandomPassword(length=18){
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
 const bytes=new Uint32Array(length);crypto.getRandomValues(bytes);
 return Array.from(bytes,n=>chars[n%chars.length]).join("");
}
function openOwnPassword(){
 if(state.adminRole!=="super_admin"){toast("تغيير كلمة مرور مركز التحكم متاح للمالك الأساسي فقط.");return}
 const d=$("own-password-modal");if(d)d.showModal()
}
async function loadAdmins(){
 const r=await api("list_admins");state.platformAdmins=r.admins||[];
 const labels={super_admin:"مدير المنصة الأعلى",platform_admin:"مدير مساعد",support:"دعم فني"};
 const permissionNames={view_dashboard:"النظرة العامة",view_accounts:"عرض الحسابات",manage_accounts:"إدارة الحسابات",send_notices:"إرسال التنبيهات",view_notices:"عرض التنبيهات",view_audit:"سجل العمليات"};
 $("admin-rows").innerHTML=state.platformAdmins.map(a=>{
  const chips=Object.entries(a.permissions||{}).filter(([k,v])=>v&&permissionNames[k]).map(([k])=>'<span class="role-chip">'+esc(permissionNames[k])+'</span>').join(" ");
  const action=a.is_current||a.admin_role==="super_admin"?'<span class="muted">حساب محمي</span>':'<button type="button" class="row-btn" data-edit-admin="'+esc(a.user_id)+'">الصلاحيات</button> <button type="button" class="row-btn danger" data-remove-admin="'+esc(a.user_id)+'">إزالة</button>';
  return '<tr><td><b>'+esc(a.full_name||"مدير")+'</b><br><small dir="ltr">'+esc(a.email)+'</small></td><td>'+esc(labels[a.admin_role]||a.admin_role)+'</td><td>'+(chips||'<span class="muted">لا توجد صلاحيات إضافية</span>')+'</td><td>'+esc(fmt(a.created_at))+'</td><td>'+action+'</td></tr>';
 }).join("")||'<tr><td colspan="5" class="empty">لا يوجد مديرون مساعدين بعد.</td></tr>';
}
function openAdminEditor(admin=null){
 const form=$("admin-form");form.reset();const edit=!!admin;
 form.elements.user_id.value=admin?.user_id||"";
 $("admin-modal-title").textContent=edit?"تعديل صلاحيات المدير المساعد":"إضافة مدير مساعد";
 $("admin-form-submit").textContent=edit?"حفظ الصلاحيات":"إنشاء حساب المدير المساعد";
 $("admin-create-fields").hidden=edit;
 ["full_name","email","password"].forEach(n=>{form.elements[n].required=!edit;form.elements[n].disabled=edit});
 form.elements.admin_role.value=admin?.admin_role||"support";
 document.querySelectorAll('#admin-permissions input[name="permissions"]').forEach(c=>{c.checked=admin?admin.permissions?.[c.value]===true:c.value==="view_dashboard"});
 $("admin-modal").showModal();
}
$("login-form").onsubmit=async e=>{
 e.preventDefault();const email=$("email").value.trim().toLowerCase(),password=$("password").value;
 if(!email||!password){status("اكتب البريد الإلكتروني وكلمة المرور.",true);return}
 status("جارٍ التحقق من بيانات الدخول…");$("login-submit").disabled=true;
 try{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;if(!data.session)throw new Error("لم تكتمل جلسة الدخول.");await enter(data.session)}
 catch(err){status(err.message||"تعذر تسجيل الدخول. راجع البريد وكلمة المرور.",true)}
 finally{$("login-submit").disabled=false}
};
$("forgot-password").onclick=async()=>{
 const email=$("email").value.trim().toLowerCase();if(!email){status("اكتب بريدك الإلكتروني أولًا.",true);return}
 status("جارٍ إرسال رابط استعادة كلمة المرور…");
 try{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(error)throw error;status("تم إرسال رابط الاستعادة إلى البريد. افتحه ثم عيّن كلمة مرور جديدة.")}
 catch(err){status(err.message,true)}
};
$("toggle-login-password").onclick=()=>{const input=$("password");input.type=input.type==="password"?"text":"password";$("toggle-login-password").textContent=input.type==="password"?"إظهار كلمة المرور":"إخفاء كلمة المرور"};
$("self-password-button").onclick=()=>openOwnPassword();
$("own-password-form").onsubmit=e=>runForm(e,async f=>{
 if(state.adminRole!=="super_admin")throw new Error("تغيير كلمة مرور مركز التحكم متاح للمالك الأساسي فقط.");
 const currentPassword=String(f.get("current_password")||"");
 const p=String(f.get("password")||""),confirmP=String(f.get("password_confirm")||"");
 if(currentPassword.length<6||currentPassword.length>72)throw new Error("اكتب كلمة المرور الحالية الصحيحة.");
 if(p.length<6||p.length>72)throw new Error("كلمة المرور الجديدة يجب أن تكون من 6 إلى 72 حرفًا.");
 if(p!==confirmP)throw new Error("تأكيد كلمة المرور الجديدة غير مطابق.");
 if(p===currentPassword)throw new Error("كلمة المرور الجديدة يجب أن تختلف عن الحالية.");
 const {error}=await db.auth.updateUser({password:p,currentPassword});
 if(error){
  if(/current password|invalid.*password|password.*incorrect/i.test(String(error.message||"")))throw new Error("كلمة المرور الحالية غير صحيحة. لم يتم تغيير كلمة المرور.");
  throw error;
 }
 $("own-password-modal").close();e.target.reset();toast("تم التحقق من كلمة المرور الحالية وتحديث كلمة مرور المالك بنجاح. استخدم الجديدة في الدخول القادم.");
});
$("broadcast-form").onsubmit=e=>runForm(e,async f=>{
 const target=f.get("target_group");
 if(target==="all"&&!confirm("سيتم إرسال هذا التنبيه إلى جميع حسابات المستخدمين العادية. هل تريد المتابعة؟"))return;
 const result=await api("send_broadcast_notice",{title:f.get("title"),message:f.get("message"),severity:f.get("severity"),target_group:target});
 e.target.reset();toast(result.message||"تم إرسال التنبيه.");
 if(state.permissions.view_notices||state.adminRole==="super_admin")await loadNotices();
});
$("add-admin").onclick=()=>openAdminEditor();
$("admin-form").onsubmit=e=>runForm(e,async f=>{
 const permissions={};document.querySelectorAll('#admin-permissions input[name="permissions"]').forEach(c=>permissions[c.value]=c.checked);
 const id=f.get("user_id");let result;
 if(id)result=await api("update_admin_access",{user_id:id,admin_role:f.get("admin_role"),permissions});
 else result=await api("create_admin",{full_name:f.get("full_name"),email:f.get("email"),password:f.get("password"),admin_role:f.get("admin_role"),permissions});
 $("admin-modal").close();e.target.reset();toast(result.message||"تم حفظ الصلاحيات.");await loadAdmins();
});
$("admin-generate").onclick=()=>{$("admin-password").value=makeRandomPassword(18);$("admin-password").type="text"};
$("admin-rows").onclick=async e=>{
 const edit=e.target.closest("[data-edit-admin]"),remove=e.target.closest("[data-remove-admin]");
 if(edit){const item=state.platformAdmins.find(x=>x.user_id===edit.dataset.editAdmin);if(item)openAdminEditor(item)}
 if(remove){const id=remove.dataset.removeAdmin;if(!confirm("إلغاء صلاحيات هذا الشخص في مركز التحكم؟ سيظل حسابه موجودًا."))return;try{const result=await api("remove_admin_access",{user_id:id});toast(result.message);await loadAdmins()}catch(err){toast(err.message)}}
};
document.querySelectorAll("[data-close-own]").forEach(b=>b.onclick=()=>$("own-password-modal").close());
document.querySelectorAll("[data-close-admin]").forEach(b=>b.onclick=()=>$("admin-modal").close());

})();