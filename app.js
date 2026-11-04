const {createClient} = supabase;
const db = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'academia-auth-session',experimental:{passkey:true}}});
let session=null, role='unknown', isOwner=false, ownerId=null, supervisor=null, permissions={}, students=[], groups=[], attendance=[], studentPhotoUrls={}, attendanceSelectedStudentId='', attendanceMode='camera', payments=[], links=[], supervisors=[], tab='overview', authMode='login', authChannel='email', pendingPhone='', pendingEmail='', otpPurpose='';
let loadedUserId=null, loadingUserId=null, loadVersion=0, messageTimer=null, authCallbackMessage='', academySettings=null;
let messageContacts=[], activeMessagePeerId='', messageRefreshTimer=null, messageViewVersion=0, unreadRefreshTimer=null, unreadBySender={}, unreadTotal=0;
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('ar-EG').format(Number(n||0))+' ج.م', dateText=d=>d?new Date(d+'T00:00:00').toLocaleDateString('ar-EG'):'—';
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const normalizePhone=raw=>{let p=String(raw||'').trim().replace(/[\s()-]/g,'');if(/^01[0125]\d{8}$/.test(p))p='+20'+p.slice(1);return p};
const msg=t=>{clearTimeout(messageTimer);$('message').textContent=t;$('message').hidden=false;messageTimer=setTimeout(()=>$('message').hidden=true,6000)};
const run=async q=>{const {data,error}=await q;if(error)throw error;return data};
const edgeFunctionErrorText=async error=>{try{const ctx=error?.context;if(ctx&&typeof ctx.clone==='function'){const body=await ctx.clone().json();if(body?.error)return String(body.error)}}catch{}return String(error?.message||'تعذر الاتصال بالخدمة.')};
function lockForm(handler){return async e=>{e.preventDefault();const form=e.currentTarget;if(form.dataset.busy==='true')return;form.dataset.busy='true';const button=form.querySelector('button[type="submit"],button:not([type])');const originalLabel=button?.textContent;if(button){button.disabled=true;button.textContent='جارٍ الحفظ…'}try{await handler(e)}finally{form.dataset.busy='false';if(button?.isConnected){button.disabled=false;button.textContent=originalLabel}}}}
$('today').textContent=new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
const themeToggle=$('theme-toggle');
const authThemeToggle=$('auth-theme-toggle');
const mobileNavToggle=$('mobile-nav-toggle');
const mobileNavBackdrop=$('mobile-nav-backdrop');
function closeMobileNav(){ $('dashboard')?.classList.remove('mobile-nav-open');mobileNavToggle?.setAttribute('aria-expanded','false'); }
function toggleMobileNav(){
 if(!mobileNavToggle)return;
 const opening=!$('dashboard').classList.contains('mobile-nav-open');
 $('dashboard').classList.toggle('mobile-nav-open',opening);
 mobileNavToggle.setAttribute('aria-expanded',String(opening));
}
if(mobileNavToggle)mobileNavToggle.onclick=toggleMobileNav;
if(mobileNavBackdrop)mobileNavBackdrop.onclick=closeMobileNav;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav()});
window.addEventListener('resize',()=>{if(window.innerWidth>760)closeMobileNav()});
const DEFAULT_ACADEMY_SETTINGS={
 profile:{academyName:'أكاديميا',displayName:'',contactPhone:'',address:'',logoUrl:''},
 appearance:{theme:'dark',accent:'violet',fontSize:'normal',density:'comfortable',sidebar:'expanded'},
 messages:{signature:'',soundNotifications:false,templates:{
  attendance:'السلام عليكم، نتابع معكم من {{academy}} بخصوص الطالب {{student}}. تم تسجيل حالة {{status}} بتاريخ {{date}}. شكرًا لكم.',
  absence:'السلام عليكم، نود إبلاغكم بغياب الطالب {{student}} عن جلسة {{session}} بتاريخ {{date}}. برجاء المتابعة. {{academy}}',
  payment:'السلام عليكم، نذكّركم بمتابعة رسوم الطالب {{student}} بمبلغ {{amount}}. {{academy}}',
  welcome:'أهلًا بكم في {{academy}}. يسعدنا انضمام الطالب {{student}}، ونتمنى له التوفيق.'
 }},
 notifications:{messageBadges:true,browserAlerts:false,vibration:false},
 defaults:{monthlyFee:0,groupId:'',codePrefix:'ST-',autoGenerateCode:true,attendanceSession:'الجلسة الأولى'}
};
function mergeAcademySettings(value){
 const v=value&&typeof value==='object'?value:{};
 return {
  profile:{...DEFAULT_ACADEMY_SETTINGS.profile,...(v.profile||{})},
  appearance:{...DEFAULT_ACADEMY_SETTINGS.appearance,...(v.appearance||{})},
  messages:{...DEFAULT_ACADEMY_SETTINGS.messages,...(v.messages||{}),templates:{...DEFAULT_ACADEMY_SETTINGS.messages.templates,...(v.messages?.templates||{})}},
  notifications:{...DEFAULT_ACADEMY_SETTINGS.notifications,...(v.notifications||{})},
  defaults:{...DEFAULT_ACADEMY_SETTINGS.defaults,...(v.defaults||{})}
 };
}
function applyTheme(theme){
 const mode=theme==='light'?'light':'dark';
 document.documentElement.dataset.theme=mode;
 localStorage.setItem('academia-theme',mode);
 if(themeToggle)themeToggle.textContent=mode==='dark'?'☀️ الوضع الفاتح':'🌙 الوضع الداكن';
 if(authThemeToggle)authThemeToggle.textContent=mode==='dark'?'☀️ الوضع الفاتح':'🌙 الوضع الداكن';
 const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.setAttribute('content',mode==='dark'?'#0a1221':'#f3f6fc');
}
function applyAcademiaIdentity(){
 const name=String(academySettings?.profile?.academyName||'أكاديميا').trim()||'أكاديميا';
 const brand=document.querySelector('.sidebar .brand b');if(brand)brand.textContent=name;
 const logo=String(academySettings?.profile?.logoUrl||'').trim();let logoSrc='/icons/icon.svg';if(logo){try{const parsed=new URL(logo,window.location.origin);if(parsed.protocol==='https:')logoSrc=parsed.href}catch{}}
 document.querySelectorAll('.brand-mark img').forEach(img=>{img.src=logoSrc;img.alt='شعار '+name;img.loading='lazy';});
 const footer=document.querySelector('.main footer');if(footer){const first=footer.childNodes[0];if(first&&first.nodeType===3)first.textContent=name+' · نظام متابعة الطلاب ';}
 const userLabel=$('user-email');
 if(userLabel&&session?.user){userLabel.textContent=academySettings?.profile?.displayName||session.user.email||session.user.phone||'حساب أكاديميا';userLabel.title=session.user.email||'';}
 document.title=name+' | إدارة ومتابعة الطلاب';
}
function applyAcademyAppearance(){
 const appearance=academySettings?.appearance||DEFAULT_ACADEMY_SETTINGS.appearance;
 applyTheme(appearance.theme);
 document.documentElement.dataset.accent=appearance.accent||'violet';
 document.documentElement.dataset.fontSize=appearance.fontSize||'normal';
 document.documentElement.dataset.density=appearance.density||'comfortable';
 document.documentElement.dataset.sidebar=appearance.sidebar||'expanded';
 applyAcademiaIdentity();
}
async function saveAcademySettings(next){
 const value=mergeAcademySettings(next);
 await run(db.from('academy_settings').upsert({owner_id:ownerId||session.user.id,settings:value,updated_at:new Date().toISOString()},{onConflict:'owner_id'}));
 academySettings=value;applyAcademyAppearance();
 return value;
}
academySettings=mergeAcademySettings(null);
applyTheme(localStorage.getItem('academia-theme')||'dark');
const toggleAcademiaTheme=async()=>{
 const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
 academySettings=mergeAcademySettings(academySettings);
 academySettings.appearance.theme=next;
 applyAcademyAppearance();
 if(isOwner&&ownerId){try{await saveAcademySettings(academySettings)}catch(e){msg('تم تغيير المظهر محليًا لكن تعذر حفظه في الحساب: '+e.message)}}
};
if(themeToggle)themeToggle.onclick=toggleAcademiaTheme;
if(authThemeToggle)authThemeToggle.onclick=toggleAcademiaTheme;
function updateAuthView(){const signup=authMode==='signup'&&authChannel!=='code';$('name-field').hidden=!signup;$('account-type-field').hidden=!signup;$('full-name').required=signup;$('email-field').hidden=authChannel!=='email';$('email').required=authChannel==='email';$('phone-field').hidden=authChannel!=='phone';$('phone-help').hidden=authChannel!=='phone'||authMode!=='signup';$('phone').required=authChannel==='phone';$('code-field').hidden=authChannel!=='code';$('student-code').required=authChannel==='code';$('password').autocomplete=signup?'new-password':'current-password';$('auth-submit').textContent=signup?'إنشاء حساب':'تسجيل الدخول';$('toggle-auth').hidden=authChannel==='code';$('toggle-auth').textContent=signup?'لديك حساب؟ تسجيل الدخول':'ليس لديك حساب؟ إنشاء حساب';$('forgot-password').hidden=signup||authChannel!=='email';document.querySelectorAll('.channel-btn').forEach(b=>b.classList.toggle('active',b.dataset.channel===authChannel));$('auth-form').hidden=false;$('otp-form').hidden=true}
document.querySelectorAll('.channel-btn').forEach(b=>b.onclick=()=>{authChannel=b.dataset.channel;if(authChannel==='code')authMode='login';updateAuthView()});
$('toggle-auth').onclick=()=>{authMode=authMode==='login'?'signup':'login';updateAuthView();$('auth-card').classList.remove('auth-switch');void $('auth-card').offsetWidth;$('auth-card').classList.add('auth-switch')};
$('google-login').onclick=async()=>{try{$('auth-message').textContent='جارٍ تحويلك إلى Google…';const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname,queryParams:{prompt:'select_account'}}});if(error)throw error}catch(e){$('auth-message').textContent=e.message.includes('provider is not enabled')?'تسجيل Google لم يُفعّل بعد في إعدادات Supabase.':e.message}};
$('passkey-login').onclick=async()=>{const button=$('passkey-login');if(!window.PublicKeyCredential){$('auth-message').textContent='المتصفح أو الجهاز لا يدعم مفاتيح المرور. استخدم البريد الإلكتروني أو Google.';return}button.disabled=true;button.textContent='جارٍ التحقق بالبصمة أو مفتاح المرور…';try{const {error}=await db.auth.signInWithPasskey();if(error)throw error;$('auth-message').textContent='تم تسجيل الدخول بمفتاح المرور.'}catch(e){$('auth-message').textContent=/not supported|passkey_disabled|webauthn/i.test(String(e.message))?'تعذر استخدام مفتاح المرور على هذا الجهاز. جرّب جهازًا أو متصفحًا يدعم WebAuthn.':e.message}finally{button.disabled=false;button.textContent='◈ الدخول بالبصمة أو مفتاح المرور'}};

updateAuthView();
$('forgot-password').onclick=async()=>{const email=$('email').value.trim();if(!email){$('auth-message').textContent='اكتب بريدك الإلكتروني أولاً.';$('email').focus();return}try{$('auth-message').textContent='جارٍ إرسال رمز الاستعادة…';const {error}=await db.auth.resetPasswordForEmail(email);if(error)throw error;pendingEmail=email;otpPurpose='recovery';$('otp-description').textContent='أدخل رمز استعادة كلمة المرور المرسل إلى بريدك الإلكتروني.';$('otp-label').textContent='رمز البريد الإلكتروني';$('otp-token').value='';$('auth-form').hidden=true;$('otp-form').hidden=false;$('auth-message').textContent='تم إرسال رمز استعادة كلمة المرور إلى بريدك الإلكتروني.'}catch(e){$('auth-message').textContent=authErrorText(e)}};
$('reset-form').onsubmit=lockForm(async e=>{e.preventDefault();const password=$('new-password').value;try{const {error}=await db.auth.updateUser({password});if(error)throw error;recoveryMode=false;$('reset-form').hidden=true;$('auth-form').hidden=false;$('toggle-auth').hidden=false;$('forgot-password').hidden=false;$('auth-message').textContent='تم تغيير كلمة المرور بنجاح.';renderShell()}catch(x){$('auth-message').textContent=x.message}});
function authErrorText(e){const m=String(e?.message||e||'حدث خطأ غير متوقع');if(/invalid login credentials/i.test(m))return'بيانات الدخول غير صحيحة.';if(/email not confirmed/i.test(m))return'أكد بريدك الإلكتروني باستخدام رمز التحقق أولاً.';if(/phone signups are disabled/i.test(m))return'تسجيل حساب جديد برقم الهاتف غير مفعّل حاليًا في Supabase. استخدم البريد الإلكتروني مؤقتًا؛ وتفعيل الهاتف يحتاج إلى إعداد مزوّد رسائل SMS.';if(/phone.*not enabled|phone provider is not enabled/i.test(m))return'تسجيل الهاتف غير مفعّل بعد في إعدادات Supabase Auth.';if(/sms|provider|twilio|messagebird|vonage/i.test(m))return'تعذر إرسال رسالة SMS. راجع مزوّد الرسائل وإعداداته في Supabase.';if(/rate limit|too many requests/i.test(m))return'تم إرسال طلبات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.';return m}
$('auth-form').onsubmit=lockForm(async e=>{e.preventDefault();if(authChannel==='phone'&&authMode==='signup'){$('auth-message').textContent='إنشاء حساب برقم الهاتف غير متاح حاليًا. استخدم البريد الإلكتروني، أو سجّل الدخول بالهاتف إذا كان لديك حساب موجود.';return}$('auth-message').textContent='جارٍ التنفيذ…';try{const password=$('password').value;let result;if(authChannel==='code'){const code=$('student-code').value.trim();const {data,error}=await db.functions.invoke('student-code-auth',{body:{action:'resolve',code}});if(error||!data?.email)throw new Error(data?.error||'كود الطالب أو كلمة المرور غير صحيحة');result=await db.auth.signInWithPassword({email:data.email,password});if(result.error)throw new Error('كود الطالب أو كلمة المرور غير صحيحة');$('auth-message').textContent='تم تسجيل الدخول بنجاح'}else if(authChannel==='email'){const email=$('email').value.trim();if(authMode==='login'){result=await db.auth.signInWithPassword({email,password});if(result.error)throw result.error;$('auth-message').textContent='تم تسجيل الدخول'}else{result=await db.auth.signUp({email,password,options:{data:{full_name:$('full-name').value.trim(),account_type:'teacher'}}});if(result.error)throw result.error;if(result.data?.session){$('auth-message').textContent='تم إنشاء الحساب وتسجيل الدخول.'}else{pendingEmail=email;otpPurpose='email';$('otp-description').textContent='أدخل رمز تأكيد الحساب المرسل إلى بريدك الإلكتروني.';$('otp-label').textContent='رمز البريد الإلكتروني';$('otp-token').value='';$('auth-form').hidden=true;$('otp-form').hidden=false;$('auth-message').textContent='تم إرسال رمز تأكيد إلى بريدك الإلكتروني.'}}}else{const phone=normalizePhone($('phone').value);if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('اكتب رقمًا مصريًا مثل 01012345678 أو بالصيغة الدولية مثل +201012345678');if(authMode==='login'){result=await db.auth.signInWithPassword({phone,password});if(result.error)throw result.error;$('auth-message').textContent='تم تسجيل الدخول'}else{result=await db.auth.signUp({phone,password,options:{data:{full_name:$('full-name').value.trim(),account_type:'teacher'}}});if(result.error)throw result.error;pendingPhone=phone;otpPurpose='sms';$('otp-description').textContent='أدخل رمز التأكيد المرسل إلى هاتفك.';$('otp-label').textContent='رمز SMS';$('otp-token').value='';$('auth-form').hidden=true;$('otp-form').hidden=false;$('auth-message').textContent='تم إرسال طلب رمز SMS. لو لم تصلك رسالة، راجع مزوّد SMS في إعدادات Supabase.'}}}catch(e){$('auth-message').textContent=authErrorText(e)}});
$('otp-form').onsubmit=lockForm(async e=>{e.preventDefault();const token=$('otp-token').value.trim();try{if(otpPurpose==='recovery')recoveryMode=true;const options=otpPurpose==='sms'?{phone:pendingPhone,token,type:'sms'}:{email:pendingEmail,token,type:otpPurpose==='recovery'?'recovery':'email'};const {error}=await db.auth.verifyOtp(options);if(error)throw error;if(otpPurpose==='recovery'){$('auth-message').textContent='تم التحقق. اختر كلمة المرور الجديدة.';$('otp-form').hidden=true;$('reset-form').hidden=false;$('auth-form').hidden=true}else{$('auth-message').textContent=otpPurpose==='sms'?'تم تأكيد رقم الهاتف.':'تم تأكيد البريد الإلكتروني.';$('otp-form').hidden=true;$('auth-form').hidden=false}}catch(x){if(otpPurpose==='recovery')recoveryMode=false;$('auth-message').textContent=authErrorText(x)}});
$('otp-resend').onclick=async()=>{try{$('otp-resend').disabled=true;$('auth-message').textContent='جارٍ إرسال رمز جديد…';let response;if(otpPurpose==='sms')response=await db.auth.resend({type:'signup',phone:pendingPhone});else if(otpPurpose==='recovery')response=await db.auth.resetPasswordForEmail(pendingEmail);else response=await db.auth.resend({type:'signup',email:pendingEmail});if(response.error)throw response.error;$('auth-message').textContent='تم طلب إرسال رمز جديد.'}catch(e){$('auth-message').textContent=authErrorText(e)}finally{$('otp-resend').disabled=false}};
$('otp-back').onclick=()=>{$('otp-form').hidden=true;$('auth-form').hidden=false;$('auth-message').textContent='يمكنك المحاولة مرة أخرى.'};
$('logout').onclick=async()=>{const {error}=await db.auth.signOut();if(error)msg(error.message)};$('backup').onclick=backup;
$('passkey-register').onclick=async()=>{const button=$('passkey-register');if(!session?.user){msg('سجّل الدخول أولاً لتفعيل مفتاح المرور.');return}if(!window.PublicKeyCredential){msg('هذا المتصفح أو الجهاز لا يدعم مفاتيح المرور.');return}button.disabled=true;button.textContent='جارٍ تفعيل مفتاح المرور…';try{const {data,error}=await db.auth.registerPasskey();if(error)throw error;msg('تم تسجيل مفتاح المرور لهذا الحساب على هذا الجهاز. جرّب تسجيل الخروج ثم الدخول به.')}catch(e){msg(/email_not_confirmed/i.test(String(e.message))?'أكد بريدك الإلكتروني أولاً، ثم فعّل مفتاح المرور.':e.message)}finally{button.disabled=false;button.textContent='◈ تفعيل الدخول بالبصمة'}};
let authReady=false, recoveryMode=false;
async function processAuthCallback(){
 const url=new URL(window.location.href),params=url.searchParams,hash=new URLSearchParams(url.hash.slice(1));
 const tokenHash=params.get('token_hash'),type=params.get('type')||'email',code=params.get('code');
 const accessToken=hash.get('access_token'),refreshToken=hash.get('refresh_token');
 const errorText=params.get('error_description')||hash.get('error_description');
 if(errorText){const expired=/token.*(expired|invalid)|invalid.*token|otp_expired/i.test(errorText);authCallbackMessage=expired?'انتهت صلاحية رابط التأكيد أو تم استخدامه من قبل. اطلب رسالة جديدة وافتح أحدث رسالة مرة واحدة فقط.':'تعذر إكمال الدخول: '+errorText;history.replaceState({},document.title,url.pathname);return}
 try{
  if(tokenHash){
   $('auth').hidden=false;$('dashboard').hidden=true;$('auth-message').textContent='جارٍ تأكيد بريدك الإلكتروني…';
   const {error}=await db.auth.verifyOtp({token_hash:tokenHash,type});if(error)throw error;
   authCallbackMessage='تم تأكيد بريدك الإلكتروني بنجاح. أهلاً بك في أكاديميا.';
   params.delete('token_hash');params.delete('type');history.replaceState({},document.title,url.pathname+(params.toString()?'?'+params.toString():''));
  }else if(code){
   $('auth').hidden=false;$('dashboard').hidden=true;$('auth-message').textContent='جارٍ إكمال تسجيل الدخول…';
   const {error}=await db.auth.exchangeCodeForSession(code);if(error)throw error;
   if(type==='recovery')recoveryMode=true;
   authCallbackMessage='تم تأكيد بريدك الإلكتروني وتسجيل دخولك بنجاح.';
   params.delete('code');params.delete('type');history.replaceState({},document.title,url.pathname+(params.toString()?'?'+params.toString():''));
  }else if(accessToken&&refreshToken){
   const {error}=await db.auth.setSession({access_token:accessToken,refresh_token:refreshToken});if(error)throw error;
   authCallbackMessage=hash.get('type')==='recovery'?'تم التحقق من الرابط. يمكنك تعيين كلمة مرور جديدة.':'تم تأكيد بريدك الإلكتروني بنجاح.';
   if(hash.get('type')==='recovery')recoveryMode=true;
   history.replaceState({},document.title,url.pathname+url.search);
  }
 }catch(e){
  const reason=String(e?.message||'').toLowerCase();
  authCallbackMessage=/token.*(expired|invalid)|invalid.*token|otp_expired/.test(reason)?'انتهت صلاحية رابط التأكيد أو تم استخدامه من قبل. اطلب رسالة جديدة وافتح أحدث رسالة مرة واحدة فقط.':'لم نتمكن من إكمال تسجيل الدخول أو تأكيد البريد. '+(e?.message||'تحقق من الرابط وحاول مرة أخرى.');
  history.replaceState({},document.title,url.pathname);
 }
}
const authCallbackPromise=processAuthCallback();
// Restore the saved Supabase session before deciding whether to show login.
$('auth').hidden=true;$('dashboard').hidden=true;
db.auth.onAuthStateChange((event,s)=>{
  session=s;
  if(event==='INITIAL_SESSION'&&!authReady){authReady=true;renderShell();return}
  if(!authReady)return;
  renderShell();
});
db.auth.getSession().then(async ({error})=>{
  if(error)throw error;
  await authCallbackPromise;
  const {data,error:sessionError}=await db.auth.getSession();
  if(sessionError)throw sessionError;
  session=data.session;authReady=true;renderShell();
}).catch(e=>{
  authReady=true;$('auth').hidden=false;$('dashboard').hidden=true;
  $('auth-message').textContent='تعذر استعادة تسجيل الدخول. تحقق من اتصال الإنترنت ثم حدّث الصفحة. '+e.message;
});
function renderShell(){if(recoveryMode){$('auth').hidden=false;$('dashboard').hidden=true;$('reset-form').hidden=false;$('auth-form').hidden=true;$('toggle-auth').hidden=true;$('forgot-password').hidden=true;$('auth-message').textContent=authCallbackMessage||'اكتب كلمة المرور الجديدة.';return}const authenticated=!!session;$('auth').hidden=authenticated;$('dashboard').hidden=!authenticated;if(!authenticated){if(unreadRefreshTimer){clearInterval(unreadRefreshTimer);unreadRefreshTimer=null}unreadTotal=0;unreadBySender={};loadedUserId=null;loadingUserId=null;loadVersion++;role='unknown';isOwner=false;ownerId=null;supervisor=null;permissions={};students=[];groups=[];attendance=[];studentPhotoUrls={};payments=[];links=[];supervisors=[];academySettings=mergeAcademySettings(null);applyAcademyAppearance();tab='overview';if(authCallbackMessage)$('auth-message').textContent=authCallbackMessage;return}if(authCallbackMessage){msg(authCallbackMessage);authCallbackMessage=''}$('user-email').textContent=session.user.email||session.user.phone||'حساب أكاديميا';if(loadedUserId!==session.user.id&&loadingUserId!==session.user.id)load()}
const can=key=>isOwner||permissions[key]===true;
function ageLabel(dob){
 if(!dob)return 'غير مسجل';
 const birth=new Date(dob+'T00:00:00'),now=new Date();
 if(Number.isNaN(birth.getTime())||birth>now)return '—';
 let years=now.getFullYear()-birth.getFullYear(),months=now.getMonth()-birth.getMonth();
 if(now.getDate()<birth.getDate())months--;
 if(months<0){years--;months+=12;}
 return years>0?years+' سنة'+(months?' و '+months+' شهر':''):Math.max(0,months)+' شهر';
}
async function uploadStudentPhotoFile(studentId,file,oldPath=''){
 if(!file||!file.size)return oldPath||'';
 const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 if(!extensions[file.type])throw new Error('اختر صورة JPG أو PNG أو WEBP فقط.');
 if(file.size>5*1024*1024)throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
 if(!isOwner)throw new Error('رفع صور الطلاب متاح لصاحب الأكاديمية فقط.');
 const path=(ownerId||session.user.id)+'/'+studentId+'/'+crypto.randomUUID()+'.'+extensions[file.type];
 const {error}=await db.storage.from('student-photos').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
 if(error)throw error;
 if(oldPath){try{await db.storage.from('student-photos').remove([oldPath])}catch(removeError){console.warn('Old photo cleanup:',removeError.message)}}
 return path;
}
function openStudentCard(student){
 const win=window.open('','_blank','width=850,height=700');
 if(!win){msg('اسمح بفتح النوافذ المنبثقة لطباعة بطاقة الطالب.');return}
 const qr=JSON.stringify('ACADEMIA:'+student.id),barcode=JSON.stringify(String(student.code||student.id)),photoUrl=studentPhotoUrls[student.photo_path]||'/icons/icon.svg';
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>بطاقة طالب - أكاديميا</title><style>*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;background:#f2f4f8;color:#17233e;margin:0;padding:28px}.card{max-width:720px;margin:0 auto;background:white;border:2px solid #5965d9;border-radius:22px;padding:28px;box-shadow:0 12px 35px #17233e18}.brand{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e9f2;padding-bottom:14px}.card-photo{display:flex;justify-content:center;margin:18px auto 8px}.card-photo img{width:112px;height:112px;object-fit:cover;border-radius:50%;border:4px solid #e9eaff;background:#eef1fa}.brand strong{font-size:26px;color:#5965d9}.brand small{color:#68738c}.name{font-size:24px;margin:24px 0 8px}.meta{display:flex;gap:24px;flex-wrap:wrap;color:#52617d}.codes{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}.codebox{border:1px solid #e5e9f2;border-radius:16px;padding:16px;text-align:center;min-width:0}.codebox b{display:block;margin-bottom:10px}.qr{display:flex;justify-content:center;min-height:190px;align-items:center}.barcode{width:100%;max-width:280px;height:90px}.code-text{font-family:monospace;letter-spacing:1px;font-size:15px}.foot{margin-top:20px;text-align:center;font-size:11px;color:#8a94a8}@media(max-width:560px){body{padding:10px}.card{padding:16px}.codes{grid-template-columns:1fr}.name{font-size:20px}}@media print{body{background:white;padding:0}.card{box-shadow:none;max-width:none;border:2px solid #394bb7;break-inside:avoid}@page{size:A5 portrait;margin:10mm}}</style></head><body><main class="card"><header class="brand"><strong>أكاديميا</strong><small>بطاقة تعريف الطالب</small></header><div class="card-photo"><img src="'+esc(photoUrl)+'" alt="صورة الطالب"></div><h1 class="name">'+esc(student.name)+'</h1><div class="meta"><span>كود الطالب: <b class="code-text">'+esc(student.code||'—')+'</b></span><span>العمر: <b>'+esc(ageLabel(student.date_of_birth))+'</b></span></div><section class="codes"><div class="codebox"><b>امسح QR</b><div id="qr" class="qr"></div></div><div class="codebox"><b>الباركود</b><svg id="barcode" class="barcode"></svg><div class="code-text">'+esc(student.code||'')+'</div></div></section><p class="foot">لا يحتوي الرمز على بيانات التواصل أو تاريخ الميلاد</p></main><script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script><script>window.addEventListener("load",function(){try{new QRCode(document.getElementById("qr"),{text:'+qr+',width:176,height:176,correctLevel:QRCode.CorrectLevel.M});JsBarcode("#barcode",'+barcode+',{format:"CODE128",displayValue:false,margin:4,height:72,lineColor:"#17233e"});}catch(e){document.getElementById("qr").textContent="تعذر تحميل مكتبة الرموز؛ تحقق من اتصال الإنترنت";}setTimeout(function(){window.print()},900)});<\/script></body></html>';
 win.document.open();win.document.write(html);win.document.close();
}
const scriptLoads={};
function ensureExternalScript(src,globalName){
 if(window[globalName])return Promise.resolve();
 if(!scriptLoads[src])scriptLoads[src]=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=()=>window[globalName]?resolve():reject(new Error('تعذر تحميل أداة المسح'));script.onerror=()=>reject(new Error('تعذر تحميل أداة المسح؛ تحقق من الاتصال بالإنترنت'));document.head.appendChild(script)});
 return scriptLoads[src];
}
let activeAttendanceScanner=null,attendanceScanLocked=false;
async function stopAttendanceCamera(){
 const scanner=activeAttendanceScanner;activeAttendanceScanner=null;
 if(scanner){try{if(scanner.isScanning)await scanner.stop()}catch{}try{scanner.clear()}catch{}}
 const box=$('camera-reader');if(box)box.hidden=true;
 const button=$('camera-scan-start');if(button)button.textContent='▣ فتح الكاميرا';const placeholder=$('attendance-camera-placeholder');if(placeholder)placeholder.hidden=false;
 attendanceScanLocked=false;
}
function selectAttendanceStudent(studentId){
 const student=students.find(s=>s.id===studentId),box=$('attendance-selected');if(!student||!box)return;
 attendanceSelectedStudentId=student.id;
 $('attendance-selected-name').textContent=student.name||'—';
 $('attendance-selected-code').textContent=student.code||'—';
 $('attendance-selected-group').textContent=groups.find(g=>g.id===student.group_id)?.name||'بدون مجموعة';
 $('attendance-selected-phone').textContent=student.student_phone||'—';box.hidden=false;
 const feedback=$('attendance-feedback');if(feedback)feedback.textContent='تم اختيار الطالب. راجع بياناته ثم أكد التسجيل.';
 const manual=$('attendance-manual-student');if(manual)manual.value=student.id;
}
function bindAttendanceSearch(inputId,targetId){
 const input=$(inputId),target=$(targetId);if(!input||!target)return;
 input.oninput=()=>{
  const q=input.value.trim().toLowerCase();
  const rows=students.filter(s=>!q||[s.name,s.code,s.student_phone,s.guardian_phone].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,10);
  target.hidden=false;
  target.innerHTML=rows.map(s=>'<button type="button" class="attendance-search-result" data-attendance-pick="'+esc(s.id)+'"><b>'+esc(s.name)+'</b><small>'+esc(s.code||'—')+' · '+esc(groups.find(g=>g.id===s.group_id)?.name||'بدون مجموعة')+'</small><span>اختيار ←</span></button>').join('')||'<p class="attendance-no-results">لا يوجد طالب مطابق.</p>';
  target.querySelectorAll('[data-attendance-pick]').forEach(b=>b.onclick=()=>selectAttendanceStudent(b.dataset.attendancePick));
 };
}
async function markAttendanceFromCode(raw){
 const value=String(raw||'').trim().replace(/^ACADEMIA:/i,'').trim();
 const student=students.find(x=>x.id===value||String(x.code||'').toLowerCase()===value.toLowerCase()||String(x.student_phone||'').replace(/\D/g,'')===value.replace(/\D/g,''));
 const feedback=$('attendance-feedback');
 if(!student){if(feedback)feedback.textContent='لم يتم العثور على طالب بهذا الكود. جرّب البحث بالاسم أو الهاتف.';return false}
 selectAttendanceStudent(student.id);
 if(feedback)feedback.textContent='تم التعرف على '+student.name+'. راجع البيانات ثم أكد تسجيل الحضور.';
 return true;
}
async function registerSelectedAttendance(status){
 const student=students.find(s=>s.id===attendanceSelectedStudentId),feedback=$('attendance-feedback');
 if(!student){if(feedback)feedback.textContent='اختر الطالب أولًا بالكاميرا أو الباركود أو البحث.';return}
 const date=$('attendance-session-date')?.value||localDate(),sessionName=$('attendance-session-name')?.value||'الجلسة الأولى';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){if(feedback)feedback.textContent='اختر تاريخ جلسة صحيحًا.';return}
 const existing=attendance.find(x=>x.student_id===student.id&&x.session_date===date&&(x.session_name||'الجلسة الأولى')===sessionName);
 if(existing){if(feedback)feedback.textContent='تم تسجيل الطالب في '+sessionName+' بتاريخ '+date+' بالفعل.';return}
 const button=$('attendance-confirm');if(button){button.disabled=true;button.textContent='جارٍ التسجيل…'}
 try{
  await run(db.from('attendance').insert({student_id:student.id,owner_id:ownerId||session.user.id,session_date:date,session_name:sessionName,status:status||'حاضر'}));
  attendanceSelectedStudentId='';if($('attendance-selected'))$('attendance-selected').hidden=true;
  if(feedback)feedback.textContent='✓ تم تسجيل '+(status||'حاضر')+' للطالب '+student.name;
  await load(true);msg('تم تسجيل الحضور بنجاح.');
 }catch(e){if(feedback)feedback.textContent=e.code==='23505'?'تم تسجيل الحضور مسبقًا.':e.message;else msg(e.message)}
 finally{if(button?.isConnected){button.disabled=false;button.textContent='✓ تسجيل حضور'}}
}
async function startAttendanceCamera(){
 const box=$('camera-reader'),button=$('camera-scan-start');
 if(!box||!button)return;
 if(activeAttendanceScanner){await stopAttendanceCamera();return}
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){msg('المسح بالكاميرا يحتاج فتح المنصة عبر HTTPS والسماح للمتصفح باستخدام الكاميرا.');return}
 button.disabled=true;button.textContent='جارٍ فتح الكاميرا…';box.hidden=false;const placeholder=$('attendance-camera-placeholder');if(placeholder)placeholder.hidden=true;
 try{
  await ensureExternalScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js','Html5Qrcode');
  const formats=['QR_CODE','CODE_128','CODE_39','CODE_93','EAN_13','EAN_8','UPC_A','UPC_E','ITF','CODABAR'].map(k=>window.Html5QrcodeSupportedFormats?.[k]).filter(Number.isInteger);
  const scanner=new Html5Qrcode('camera-reader',formats.length?{formatsToSupport:formats,verbose:false}:{verbose:false});
  activeAttendanceScanner=scanner;attendanceScanLocked=false;
  await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:190}},async decoded=>{
   if(attendanceScanLocked)return;attendanceScanLocked=true;
   await stopAttendanceCamera();await markAttendanceFromCode(decoded);
  },()=>{});
  button.textContent='إيقاف الكاميرا';
 }catch(e){await stopAttendanceCamera();msg('تعذر تشغيل الكاميرا: '+(e.message||'راجع إذن الكاميرا أو استخدم قارئ الباركود'))}
 finally{button.disabled=false;if(!activeAttendanceScanner)button.textContent='▣ فتح الكاميرا'}
}
async function load(force=false){if(!session?.user?.id)return;const userId=session.user.id;if(!force&&(loadedUserId===userId||loadingUserId===userId))return;loadingUserId=userId;const currentLoad=++loadVersion;$('message').textContent='جار تحميل البيانات…';$('message').hidden=false;try{
 const uid=session.user.id,email=(session.user.email||'').toLowerCase();
 const assigned=email?await run(db.from('supervisor_access').select('*').ilike('supervisor_email',email).eq('active',true).limit(1)):[];
 supervisor=assigned[0]||null;permissions=supervisor?.permissions||{};
 const owners=await run(db.from('app_owners').select('owner_id').eq('owner_id',uid).limit(1));
 isOwner=!supervisor&&owners.length>0;ownerId=supervisor?supervisor.owner_id:(isOwner?uid:null);supervisors=[];
 if(supervisor)role='supervisor';
 let mine=[];
 if(!isOwner&&!supervisor){mine=email?await run(db.from('student_portal_links').select('*').ilike('portal_email',email)):[];}
 // Every authenticated account that is not already a linked student/guardian or assigned supervisor
 // gets its own independent teacher workspace. The database RLS policy only permits owner_id = auth.uid().
 if(!isOwner&&!supervisor&&!mine.length){
   await run(db.from('app_owners').upsert({owner_id:uid},{onConflict:'owner_id',ignoreDuplicates:true}));
   isOwner=true;ownerId=uid;permissions={};
 }
 if(isOwner){role='owner';const row=await run(db.from('academy_settings').select('settings').eq('owner_id',uid).maybeSingle());academySettings=mergeAcademySettings(row?.settings);applyAcademyAppearance();}else{academySettings=mergeAcademySettings(null);applyAcademyAppearance();}
 if(!isOwner&&!supervisor){if(!mine.length){role='visitor';links=[];students=[];attendance=[];payments=[];}else{role=mine.some(x=>x.portal_role==='guardian')?'guardian':'student';links=mine;const ids=mine.map(x=>x.student_id);attendance=await run(db.from('attendance').select('*').in('student_id',ids).order('session_date',{ascending:false}));if(role==='guardian'){[payments,students]=await Promise.all([run(db.from('payments').select('*').in('student_id',ids).order('paid_at',{ascending:false})),run(db.from('students').select('id,name,code,monthly_fee,date_of_birth').in('id',ids))])}else{payments=[];students=await run(db.from('students').select('id,name,code,date_of_birth').in('id',ids))}}
 }else{
 if(isOwner)supervisors=await run(db.from('supervisor_access').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false}));
 const needsStudents=['view_students','manage_students','view_attendance','manage_attendance','view_payments','manage_payments','manage_portals'].some(can);
 students=needsStudents?await run(db.from('students').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false})):[];groups=needsStudents?await run(db.from('student_groups').select('*').eq('owner_id',ownerId).order('name',{ascending:true})):[];const ids=students.map(x=>x.id);
 studentPhotoUrls={};
 const photoPaths=students.map(x=>x.photo_path).filter(Boolean);
 if(photoPaths.length){try{const {data:photoRows,error:photoError}=await db.storage.from('student-photos').createSignedUrls(photoPaths,3600);if(!photoError)studentPhotoUrls=Object.fromEntries((photoRows||[]).filter(x=>x.signedUrl).map(x=>[x.path,x.signedUrl]));}catch(photoError){console.warn('Student photo links unavailable:',photoError.message)}}
 const jobs=[];if(ids.length&&(can('view_attendance')||can('manage_attendance')))jobs.push(run(db.from('attendance').select('*').eq('owner_id',ownerId).in('student_id',ids).order('session_date',{ascending:false}).limit(500)).then(v=>attendance=v));else attendance=[];
 if(ids.length&&(can('view_payments')||can('manage_payments')))jobs.push(run(db.from('payments').select('*').eq('owner_id',ownerId).in('student_id',ids).order('paid_at',{ascending:false}).limit(500)).then(v=>payments=v));else payments=[];
 if(isOwner||can('manage_portals'))links=await run(db.from('student_portal_links').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false}));else links=[];await Promise.all(jobs);
 }
 if(currentLoad!==loadVersion||session?.user?.id!==userId)return;loadedUserId=userId;$('role-label').textContent=role==='owner'?'مدرس مستقل':role==='supervisor'?'مشرف':role==='guardian'?'بوابة ولي الأمر':role==='student'?'بوابة الطالب':'حساب عام';drawNav();render();startUnreadRefresh();
 }catch(e){if(currentLoad===loadVersion){role='unknown';$('dashboard').hidden=true;$('auth').hidden=false;$('auth-message').textContent=e.message;}}finally{if(currentLoad===loadVersion){loadingUserId=null;if($('message').textContent==='جار تحميل البيانات…')$('message').hidden=true}}}
function drawNav(){const items=role==='visitor'?[['overview','الرئيسية','⌂']]:role==='owner'?[['overview','نظرة عامة','▦'],['students','الطلاب','♙'],['groups','المجموعات','▤'],['attendance','الحضور','✓'],['payments','المدفوعات','ج.م'],['portals','حسابات البوابة','◎'],['supervisors','المشرفون','♧'],['messages','الرسائل','✉'],['ai-import','المساعد الذكي','✦'],['settings','الإعدادات','⚙']]:role==='supervisor'?[['overview','ملخص','▦'],...(can('view_students')||can('manage_students')?[['students','الطلاب','♙']]:[]),...(can('view_attendance')||can('manage_attendance')?[['attendance','الحضور','✓']]:[]),...(can('view_payments')||can('manage_payments')?[['payments','المدفوعات','ج.م']]:[]),...(can('manage_portals')?[['portals','حسابات البوابة','◎']]:[]),['messages','الرسائل','✉']]:[['overview','ملخصي','▦'],['attendance','سجل الحضور','✓'],...(role==='guardian'?[['payments','المدفوعات','ج.م']]:[]),['messages','الرسائل','✉']];$('nav').innerHTML=items.map(([id,n,i])=>{const count=id==='messages'&&academySettings?.notifications?.messageBadges!==false?unreadTotal:0;return `<button class="nav-item ${tab===id?'active':''}" data-tab="${id}" title="${esc(n)}" aria-label="${esc(n)}"><span>${i}</span>${n}${count?`<b class="nav-count" aria-label="${count} رسائل غير مقروءة">${count>99?'99+':count}</b>`:''}</button>`}).join('');$('nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;closeMobileNav();drawNav();render()})}
async function refreshUnreadCounts(){
 if(!session?.user?.id)return;
 try{
  const {data,error}=await db.functions.invoke('academia-messages',{body:{action:'unread'}});
  if(error||data?.error)throw error||new Error(data?.error);
  const next=Number(data?.unread_total||0),previous=unreadTotal;
  unreadBySender=data?.unread_by_sender||{};
  if(next>previous){
   const prefs=academySettings?.notifications||DEFAULT_ACADEMY_SETTINGS.notifications;
   if(prefs.vibration&&navigator.vibrate)navigator.vibrate(60);
   if(prefs.browserAlerts&&document.hidden&&'Notification' in window&&Notification.permission==='granted'){
    try{new Notification(academySettings?.profile?.academyName||'أكاديميا',{body:'لديك '+(next-previous)+' رسالة جديدة.',icon:'/icons/icon.svg',tag:'academia-message-'+Date.now()})}catch{}
   }
  }
  if(next!==previous){unreadTotal=next;drawNav()}
 }catch(e){console.warn('Unread message refresh failed:',e.message)}
}
function startUnreadRefresh(){if(unreadRefreshTimer)clearInterval(unreadRefreshTimer);void refreshUnreadCounts();unreadRefreshTimer=setInterval(()=>{if(!document.hidden&&session?.user?.id)void refreshUnreadCounts()},15000)}
function table(rows,kind){if(!rows.length)return '<p class="empty-row">لا توجد سجلات حتى الآن</p>';const manage=kind==='attendance'?can('manage_attendance'):can('manage_payments');let heads=kind==='attendance'?'<th>الطالب</th><th>التاريخ</th><th>الحالة</th>':'<th>الطالب</th><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th>';if(manage)heads+='<th>إجراءات</th>';let body=rows.map(r=>{let student=students.find(s=>s.id===r.student_id),name=student?.name||'طالب';const actions=manage?'<td><button class="text-button" data-record-edit="'+kind+'" data-record-id="'+r.id+'">تعديل</button> <button class="text-button danger-action" data-record-delete="'+kind+'" data-record-id="'+r.id+'">حذف</button>'+(kind==='attendance'?(student?.guardian_phone?'<br><a class="text-button whatsapp-action" target="_blank" rel="noopener noreferrer" href="'+whatsAppFollowupUrl(student,r)+'">واتساب ولي الأمر</a>':'<br><small class="muted">لا يوجد رقم ولي أمر</small>'):'')+'</td>':'';return kind==='attendance'?'<tr><td>'+esc(name)+'</td><td>'+dateText(r.session_date)+'</td><td><span class="status '+(r.status==='حاضر'?'good':r.status==='غائب'?'bad':'warn')+'">'+esc(r.status)+'</span></td>'+actions+'</tr>':'<tr><td>'+esc(name)+'</td><td>'+dateText(r.paid_at)+'</td><td><b>'+money(r.amount)+'</b></td><td>'+esc(r.note||'—')+'</td>'+actions+'</tr>'}).join('');return '<div class="table-wrap"><table><thead><tr>'+heads+'</tr></thead><tbody>'+body+'</tbody></table></div>'}
function fillAcademyTemplate(template,values={}){let text=String(template||'');for(const [key,value] of Object.entries(values))text=text.replace(new RegExp('{{'+key+'}}','g'),String(value??''));return text.replace(/\s{2,}/g,' ').trim()}
function whatsAppFollowupUrl(student,record){let phone=String(student?.guardian_phone||'').replace(/[^0-9+]/g,'');if(/^01[0125]\d{8}$/.test(phone))phone='20'+phone.slice(1);phone=phone.replace(/\D/g,'');if(!phone)return '#';const status=record.status||'الحضور';const template=academySettings?.messages?.templates?.attendance||DEFAULT_ACADEMY_SETTINGS.messages.templates.attendance;let text=fillAcademyTemplate(template,{academy:academySettings?.profile?.academyName||'أكاديميا',student:student.name,status,date:record.session_date,session:record.session_name||'الجلسة الأولى',amount:record.amount||''});const signature=academySettings?.messages?.signature;if(signature)text+='\n'+signature;return 'https://wa.me/'+phone+'?text='+encodeURIComponent(text)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){if(role==='visitor'){$('page-title').textContent='مرحبًا بك في أكاديميا';$('content').innerHTML='<section class="panel"><h2>حسابك جاهز 🎉</h2><p>أنت الآن في الوضع العام. لعرض بيانات طالب أو تسجيل الحضور، اطلب من إدارة الأكاديمية ربط بريدك الإلكتروني بملف الطالب.</p><p class="muted">حسابات الطلاب وأولياء الأمور لا ترى إلا السجلات المرتبطة بها.</p><button type="button" id="visitor-signout" class="text-button">تسجيل الخروج</button></section>';$('visitor-signout').onclick=async()=>{await db.auth.signOut()};return;}const title={overview:role==='owner'?'نظرة عامة':'ملخص الحساب',supervisors:'إدارة المشرفين',students:'إدارة الطلاب',groups:'مجموعات الطلاب',attendance:'الحضور والغياب',payments:'المدفوعات',portals:'حسابات البوابة',messages:'الرسائل والمحادثات','ai-import':'المساعد الذكي',settings:'إعدادات أكاديميا'};$('page-title').textContent=title[tab]||'لوحة التحكم';if(tab!=='attendance'&&activeAttendanceScanner)void stopAttendanceCamera();if(tab!=='messages'&&messageRefreshTimer){clearInterval(messageRefreshTimer);messageRefreshTimer=null;}const total=payments.reduce((a,p)=>a+Number(p.amount||0),0),present=attendance.filter(a=>a.status==='حاضر').length;
if(tab==='settings'&&role==='owner'){
 const s=mergeAcademySettings(academySettings),p=s.profile,a=s.appearance,m=s.messages,d=s.defaults;
 $('content').innerHTML=`<div class="settings-page">
  <div class="settings-intro"><div><p class="eyebrow">مركز التحكم</p><h2>إعدادات أكاديميا</h2><p>تحكم في هوية الأكاديمية والمظهر والرسائل والتنبيهات والأمان من مكان واحد.</p></div><span class="settings-saved-mark">⚙ إعدادات الحساب</span></div>
  <nav id="settings-tabs" class="settings-tabs" aria-label="أقسام الإعدادات"><button type="button" data-settings-jump="settings-identity">عام وهوية</button><button type="button" data-settings-jump="settings-appearance">المظهر</button><button type="button" data-settings-jump="settings-messages">الرسائل</button><button type="button" data-settings-jump="settings-notifications">التنبيهات</button><button type="button" data-settings-jump="settings-defaults">الطلاب والحضور</button><button type="button" data-settings-jump="settings-security">الأمان</button></nav>
  <form id="academy-settings-form" class="settings-form">
   <section id="settings-identity" class="settings-card">
    <div class="settings-section-head"><span class="settings-section-icon">▣</span><div><h3>هوية الأكاديمية والحساب</h3><p>الاسم الذي يظهر في القائمة والتذييل وملفات التواصل.</p></div></div>
    <div class="settings-fields">
     <label>اسم الأكاديمية<input name="academyName" maxlength="80" required value="${esc(p.academyName)}" placeholder="أكاديميا"></label>
     <label>اسم صاحب الحساب<input name="displayName" maxlength="80" value="${esc(p.displayName)}" placeholder="الاسم الظاهر في الحساب"></label>
     <label>هاتف التواصل<input name="contactPhone" type="tel" maxlength="25" value="${esc(p.contactPhone)}" placeholder="01xxxxxxxxx"></label>
     <label>عنوان الأكاديمية<input name="address" maxlength="180" value="${esc(p.address)}" placeholder="المدينة أو العنوان المختصر"></label>
     <label class="settings-span-2">رابط شعار الأكاديمية<input name="logoUrl" type="url" maxlength="500" value="${esc(p.logoUrl||'')}" placeholder="https://example.com/logo.png"><small>اتركه فارغًا لاستخدام الشعار الافتراضي. استخدم رابط صورة HTTPS.</small></label>
     <label class="settings-readonly">بريد تسجيل الدخول<input value="${esc(session?.user?.email||'')}" readonly><small>تغيير البريد يحتاج خطوة تحقق منفصلة من الحساب.</small></label>
    </div>
   </section>
   <section id="settings-appearance" class="settings-card">
    <div class="settings-section-head"><span class="settings-section-icon">◐</span><div><h3>المظهر والتصميم</h3><p>اختَر شكل الواجهة وحجم الخط وكثافة العناصر.</p></div></div>
    <div class="settings-fields">
     <label>السمة<select name="theme"><option value="dark" ${a.theme==='dark'?'selected':''}>داكنة — كحلي</option><option value="light" ${a.theme==='light'?'selected':''}>فاتحة — نظيفة</option></select></label>
     <label>اللون الأساسي<select name="accent"><option value="violet" ${a.accent==='violet'?'selected':''}>بنفسجي</option><option value="blue" ${a.accent==='blue'?'selected':''}>أزرق</option><option value="teal" ${a.accent==='teal'?'selected':''}>تركواز</option><option value="rose" ${a.accent==='rose'?'selected':''}>وردي</option><option value="amber" ${a.accent==='amber'?'selected':''}>ذهبي</option></select></label>
     <label>حجم الخط<select name="fontSize"><option value="small" ${a.fontSize==='small'?'selected':''}>صغير</option><option value="normal" ${a.fontSize==='normal'?'selected':''}>متوسط</option><option value="large" ${a.fontSize==='large'?'selected':''}>كبير</option></select></label>
     <label>كثافة العرض<select name="density"><option value="comfortable" ${a.density==='comfortable'?'selected':''}>مريح</option><option value="compact" ${a.density==='compact'?'selected':''}>مضغوط — صفوف أقل ارتفاعًا</option></select></label>
     <label>القائمة الجانبية<select name="sidebar"><option value="expanded" ${a.sidebar==='expanded'?'selected':''}>كاملة</option><option value="compact" ${a.sidebar==='compact'?'selected':''}>أيقونات فقط على الكمبيوتر</option></select></label>
    </div>
    <div class="settings-preview"><span class="preview-dot"></span><span>معاينة اللون والمظهر</span><button type="button" id="settings-preview-theme" class="settings-preview-button">تبديل سريع</button></div>
   </section>
   <section id="settings-messages" class="settings-card">
    <div class="settings-section-head"><span class="settings-section-icon">✉</span><div><h3>إعدادات الرسائل وقوالب التواصل</h3><p>عدّل النصوص الجاهزة التي تستخدمها مع أولياء الأمور والطلاب. لا يتم إرسال شيء تلقائيًا.</p></div></div>
    <div class="settings-fields">
     <label class="settings-span-2">توقيع الرسائل<input name="messageSignature" maxlength="180" value="${esc(m.signature)}" placeholder="مع تحيات إدارة أكاديميا"></label>
     <label class="settings-span-2">رسالة متابعة الحضور<textarea name="attendanceTemplate" rows="3" maxlength="1000">${esc(m.templates.attendance)}</textarea><small>متغيرات متاحة: {{academy}}، {{student}}، {{status}}، {{date}}</small></label>
     <label class="settings-span-2">رسالة الغياب<textarea name="absenceTemplate" rows="3" maxlength="1000">${esc(m.templates.absence)}</textarea><small>متغيرات متاحة: {{academy}}، {{student}}، {{session}}، {{date}}</small></label>
     <label class="settings-span-2">تذكير الرسوم<textarea name="paymentTemplate" rows="3" maxlength="1000">${esc(m.templates.payment)}</textarea><small>متغيرات متاحة: {{academy}}، {{student}}، {{amount}}</small></label>
     <label class="settings-span-2">رسالة ترحيب<textarea name="welcomeTemplate" rows="3" maxlength="1000">${esc(m.templates.welcome)}</textarea><small>متغيرات متاحة: {{academy}}، {{student}}</small></label>
    </div>
   </section>
   <section id="settings-notifications" class="settings-card">
    <div class="settings-section-head"><span class="settings-section-icon">♧</span><div><h3>التنبيهات والإشعارات</h3><p>تحكم في مؤشرات الرسائل والتنبيهات أثناء استخدام أكاديميا.</p></div></div>
    <div class="settings-fields settings-notification-grid">
     <label class="settings-check"><span><b>عداد الرسائل غير المقروءة</b><small>إظهار عدد الرسائل الجديدة بجوار الرسائل في القائمة.</small></span><input type="checkbox" name="messageBadges" ${s.notifications.messageBadges?'checked':''}></label>
     <label class="settings-check"><span><b>اهتزاز عند وصول رسالة</b><small>يعمل إذا كان الجهاز والمتصفح يدعمان الاهتزاز.</small></span><input type="checkbox" name="vibration" ${s.notifications.vibration?'checked':''}></label>
     <label class="settings-check settings-span-2"><span><b>إشعارات المتصفح</b><small>إظهار تنبيه على الجهاز عند وصول رسالة جديدة والصفحة في الخلفية.</small></span><input type="checkbox" name="browserAlerts" ${s.notifications.browserAlerts?'checked':''}></label>
     <div class="settings-span-2 settings-permission-row"><span id="settings-notification-permission">${'Notification' in window?('حالة إذن المتصفح: '+Notification.permission):'هذا المتصفح لا يدعم إشعارات النظام.'}</span><button type="button" id="settings-enable-notifications" class="settings-reset-button">السماح بإشعارات المتصفح</button></div>
    </div>
   </section>
   <section id="settings-defaults" class="settings-card">
    <div class="settings-section-head"><span class="settings-section-icon">♙</span><div><h3>الإعدادات الافتراضية للطلاب والحضور</h3><p>تستخدم تلقائيًا عند إضافة طالب أو بدء تسجيل جلسة.</p></div></div>
    <div class="settings-fields">
     <label>الرسوم الشهرية الافتراضية<input name="monthlyFee" type="number" min="0" step="0.01" value="${Number(d.monthlyFee||0)}"></label>
     <label>المجموعة الافتراضية<select name="defaultGroup"><option value="">بدون مجموعة</option>${groups.map(g=>'<option value="'+esc(g.id)+'" '+(d.groupId===g.id?'selected':'')+'>'+esc(g.name)+'</option>').join('')}</select></label>
     <label>بادئة كود الطالب<input name="codePrefix" maxlength="12" pattern="[A-Za-z0-9_-]*" value="${esc(d.codePrefix)}" placeholder="ST-"></label>
     <label>جلسة الحضور الافتراضية<input name="attendanceSession" maxlength="60" value="${esc(d.attendanceSession)}" placeholder="الجلسة الأولى"></label>
     <label class="settings-check"><input type="checkbox" name="autoGenerateCode" ${d.autoGenerateCode?'checked':''}> توليد كود تلقائي عند ترك خانة الكود فارغة</label>
    </div>
   </section>
   <div class="settings-actions"><button type="submit" class="settings-save-button">حفظ كل الإعدادات</button><button type="button" id="settings-reset-defaults" class="settings-reset-button">استعادة الإعدادات الافتراضية</button></div>
   <p id="settings-status" class="settings-status" aria-live="polite">إعداداتك محفوظة في حساب الأكاديمية وتظهر على أجهزتك بعد تسجيل الدخول.</p>
  </form>
  <section id="settings-security" class="settings-card settings-security-card">
   <div class="settings-section-head"><span class="settings-section-icon">⌑</span><div><h3>أمان الحساب وتأكيد الهوية</h3><p>تغييرات البريد وكلمة المرور لا تتم بمجرد تعديل الحقول؛ يلزم تحقق من الحساب.</p></div></div>
   <div class="settings-security-block">
    <div class="settings-security-title"><b>تغيير البريد الإلكتروني</b><small>سنرسل روابط تأكيد إلى البريد الحالي والبريد الجديد. يظل بريد الدخول الحالي فعالًا حتى إتمام التأكيد.</small></div>
    <form id="settings-email-form" class="settings-fields">
     <label>البريد الحالي<input value="${esc(session?.user?.email||'')}" readonly></label>
     <label>البريد الجديد<input name="newEmail" type="email" autocomplete="email" required placeholder="name@example.com"></label>
     <label class="settings-span-2">كلمة المرور الحالية<input name="currentPassword" type="password" autocomplete="current-password" required placeholder="أكد هويتك قبل طلب تغيير البريد"></label>
     <div class="settings-span-2"><button type="submit" class="settings-save-button">إرسال طلب تغيير البريد والتحقق</button></div>
     <p id="settings-email-status" class="settings-status settings-span-2" aria-live="polite">لن يتغير بريد الحساب حتى تؤكد روابط التحقق المطلوبة عبر البريد.</p>
    </form>
   </div>
   <div class="settings-security-block">
    <div class="settings-security-title"><b>تغيير كلمة المرور</b><small>أدخل كلمة المرور الحالية أولًا. لن يتم حفظ الجديدة إلا بعد قبول التحقق.</small></div>
    <form id="settings-password-form" class="settings-fields">
     <label>كلمة المرور الحالية<input name="currentPassword" type="password" autocomplete="current-password" required></label>
     <label>كلمة المرور الجديدة<input name="newPassword" type="password" minlength="6" autocomplete="new-password" required></label>
     <label>تأكيد كلمة المرور<input name="confirmPassword" type="password" minlength="6" autocomplete="new-password" required></label>
     <div class="settings-span-2"><button type="submit" class="settings-save-button">تحقق ثم تحديث كلمة المرور</button></div>
     <p class="settings-status settings-span-2">تغيير كلمة المرور يستخدم التحقق من كلمة المرور الحالية على خادم المصادقة.</p>
    </form>
   </div>
  </section>
 </div>`;
 const form=$('academy-settings-form');
 const preview=()=>{const v=new FormData(form);const next=mergeAcademySettings({...s,profile:{academyName:v.get('academyName'),displayName:v.get('displayName'),contactPhone:v.get('contactPhone'),address:v.get('address')},appearance:{theme:v.get('theme'),accent:v.get('accent'),fontSize:v.get('fontSize'),density:v.get('density'),sidebar:v.get('sidebar')}});document.documentElement.dataset.theme=next.appearance.theme;document.documentElement.dataset.accent=next.appearance.accent;document.documentElement.dataset.fontSize=next.appearance.fontSize;document.documentElement.dataset.density=next.appearance.density;document.documentElement.dataset.sidebar=next.appearance.sidebar;};
 form.querySelectorAll('select[name="theme"],select[name="accent"],select[name="fontSize"],select[name="density"],select[name="sidebar"]').forEach(el=>el.onchange=preview);
 $('settings-tabs').querySelectorAll('[data-settings-jump]').forEach(button=>button.onclick=()=>$(button.dataset.settingsJump)?.scrollIntoView({behavior:'smooth',block:'start'}));
 $('settings-enable-notifications').onclick=async()=>{if(!('Notification' in window)){msg('متصفحك لا يدعم إشعارات النظام.');return}try{const permission=await Notification.requestPermission();$('settings-notification-permission').textContent='حالة إذن المتصفح: '+permission;if(permission==='granted'){form.elements.browserAlerts.checked=true;msg('تم السماح بإشعارات المتصفح. اضغط حفظ كل الإعدادات لتطبيق التفضيل.')}else msg('لم يتم السماح بإشعارات المتصفح. يمكنك تفعيلها لاحقًا من إعدادات المتصفح.')}catch(e){msg('تعذر طلب إذن الإشعارات: '+e.message)}};
 $('settings-preview-theme').onclick=()=>{const el=form.elements.theme;el.value=el.value==='dark'?'light':'dark';preview()};
 form.onsubmit=lockForm(async e=>{
  e.preventDefault();const v=new FormData(form),monthlyFee=Number(v.get('monthlyFee'));
  if(!Number.isFinite(monthlyFee)||monthlyFee<0){msg('راجع قيمة الرسوم الافتراضية.');return}
  const next=mergeAcademySettings({
   profile:{academyName:String(v.get('academyName')||'').trim(),displayName:String(v.get('displayName')||'').trim(),contactPhone:String(v.get('contactPhone')||'').trim(),address:String(v.get('address')||'').trim(),logoUrl:String(v.get('logoUrl')||'').trim()},
   appearance:{theme:v.get('theme'),accent:v.get('accent'),fontSize:v.get('fontSize'),density:v.get('density'),sidebar:v.get('sidebar')},
   messages:{signature:String(v.get('messageSignature')||'').trim(),soundNotifications:v.get('soundNotifications')==='on',templates:{attendance:String(v.get('attendanceTemplate')||''),absence:String(v.get('absenceTemplate')||''),payment:String(v.get('paymentTemplate')||''),welcome:String(v.get('welcomeTemplate')||'')}},
   notifications:{messageBadges:v.get('messageBadges')==='on',vibration:v.get('vibration')==='on',browserAlerts:v.get('browserAlerts')==='on'},
   defaults:{monthlyFee,groupId:String(v.get('defaultGroup')||''),codePrefix:String(v.get('codePrefix')||'ST-').trim(),attendanceSession:String(v.get('attendanceSession')||'الجلسة الأولى').trim()||'الجلسة الأولى',autoGenerateCode:v.get('autoGenerateCode')==='on'}
  });
  if(!next.profile.academyName){msg('اسم الأكاديمية مطلوب.');return}
  if(next.defaults.codePrefix&&!/^[A-Za-z0-9_-]{1,12}$/.test(next.defaults.codePrefix)){msg('بادئة الكود يجب أن تحتوي حروفًا إنجليزية أو أرقامًا أو شرطة فقط.');return}
  try{await saveAcademySettings(next);$('settings-status').textContent='✓ تم حفظ الإعدادات بنجاح.';msg('تم حفظ إعدادات أكاديميا.')}catch(x){$('settings-status').textContent='تعذر الحفظ: '+x.message;msg(x.message)}
 });
 $('settings-reset-defaults').onclick=async()=>{if(!confirm('استعادة جميع إعدادات الأكاديمية الافتراضية؟'))return;try{await saveAcademySettings(mergeAcademySettings(null));msg('تمت استعادة الإعدادات الافتراضية.');render()}catch(x){msg(x.message)}};
 $('settings-email-form').onsubmit=lockForm(async e=>{
  e.preventDefault();
  const v=new FormData(e.currentTarget),newEmail=String(v.get('newEmail')||'').trim().toLowerCase(),currentPassword=String(v.get('currentPassword')||'');
  const currentEmail=String(session?.user?.email||'').trim().toLowerCase();
  const status=$('settings-email-status');
  if(!/^\\S+@\\S+\\.\\S+$/.test(newEmail)){msg('اكتب بريدًا إلكترونيًا صحيحًا.');return}
  if(newEmail===currentEmail){msg('البريد الجديد هو نفسه البريد الحالي.');return}
  if(!currentEmail){msg('هذا الحساب لا يحتوي على بريد إلكتروني لتغييره من هذه الصفحة.');return}
  if(!currentPassword){msg('أدخل كلمة المرور الحالية لتأكيد هويتك.');return}
  try{
   const {error}=await db.auth.updateUser({email:newEmail,current_password:currentPassword},{emailRedirectTo:window.location.origin+window.location.pathname});
   if(error)throw error;
   e.currentTarget.reset();
   status.textContent='تم إرسال طلب تغيير البريد. افتح رسائل البريد الحالي والجديد وأكمل روابط التأكيد؛ سيظل البريد القديم مستخدمًا حتى اكتمال التحقق.';
   msg('أرسلنا روابط تأكيد تغيير البريد. لم يتغير بريد الدخول بعد.');
  }catch(x){status.textContent=x.message||'تعذر إرسال طلب تغيير البريد.';msg(status.textContent)}
 });
 $('settings-password-form').onsubmit=lockForm(async e=>{
  e.preventDefault();
  const v=new FormData(e.currentTarget),currentPassword=String(v.get('currentPassword')||''),password=String(v.get('newPassword')||''),confirmPassword=String(v.get('confirmPassword')||'');
  if(currentPassword.length<1){msg('أدخل كلمة المرور الحالية.');return}
  if(password.length<6){msg('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف. لا يوجد شرط لنوع الحروف أو الأرقام.');return}
  if(password!==confirmPassword){msg('تأكيد كلمة المرور غير مطابق.');return}
  if(password===currentPassword){msg('اختر كلمة مرور جديدة مختلفة عن الحالية.');return}
  try{
   const {error}=await db.auth.updateUser({password,current_password:currentPassword});
   if(error)throw new Error(/current password|invalid.*password|password.*incorrect/i.test(error.message)?'كلمة المرور الحالية غير صحيحة؛ لم يتم تحديث كلمة المرور.':error.message);
   e.currentTarget.reset();msg('تم التحقق من كلمة المرور الحالية وتحديث كلمة المرور بنجاح.');
  }catch(x){msg(x.message||'تعذر تحديث كلمة المرور.')}
 });
 return;
}

if(tab==='ai-import'&&role==='owner'){
 $('content').innerHTML=`<section class="panel"><div class="panel-heading"><div><h3>المساعد الذكي لاستيراد الطلاب</h3><p>حلّل صورة أو PDF أو نصًا، ثم راجع كل سجل قبل حفظه.</p></div></div>
 <form id="ai-import-form" class="form-grid ai-import-form"><label>ملف صورة أو PDF<input id="ai-import-file" type="file" accept="image/*,application/pdf"></label><label>أو الصق قائمة الطلاب<textarea id="ai-import-text" rows="5" placeholder="مثال: أحمد محمد، هاتف 010...، رسوم 300"></textarea></label><button type="submit" class="ai-primary-btn">✦ تحليل واستخراج البيانات</button></form>
 <p id="ai-import-status" class="muted" aria-live="polite">لن يتم حفظ أي طالب قبل مراجعتك والضغط على زر الحفظ.</p><div id="ai-import-results"></div></section>`;
 $('ai-import-form').onsubmit=async e=>{e.preventDefault();const status=$('ai-import-status'),file=$('ai-import-file').files[0],text=$('ai-import-text').value.trim();status.classList.remove('ai-import-error');if(!file&&!text){status.textContent='اختر ملفًا أو اكتب بيانات الطلاب أولاً.';return}if(file&&file.size>12*1024*1024){status.textContent='حجم الملف أكبر من 12 ميجابايت.';return}const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;status.textContent='جارٍ تحليل البيانات…';try{let payload={text};if(file){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=reject;reader.readAsDataURL(file)});payload.file={name:file.name,type:file.type,data}}const {data,error}=await db.functions.invoke('academia-ai-import',{body:payload});if(error)throw new Error(await edgeFunctionErrorText(error));if(data?.error)throw new Error(data.error);const rows=Array.isArray(data?.students)?data.students:[];if(!rows.length){status.textContent='لم يتم العثور على سجلات طلاب واضحة. جرّب ملفًا أوضح.';return}renderAIImportPreview(rows);status.textContent='تم استخراج '+rows.length+' سجلًا. راجع وعدّل البيانات قبل الحفظ.'}catch(x){status.textContent=x.message||'تعذر تحليل الملف.';status.classList.add('ai-import-error')}finally{btn.disabled=false}};
 return;
}

if(tab==='overview'){$('content').innerHTML=`<div class="welcome"><div><p>مرحبًا بك في أكاديميا</p><h2>${role==='owner'?'كل تفاصيل السنتر في نظرة واحدة':'تابع تقدمك أولًا بأول'}</h2><p>إدارة منظمة للحضور والرسوم وبيانات الطلاب</p>${(role==='student'||role==='guardian')?`<p class="portal-age-line">${students.map(st=>esc(st.name)+' · العمر: '+esc(ageLabel(st.date_of_birth))).join(' — ')}</p>`:''}</div><div style="font-size:70px;color:#ffffff44">✦</div></div><div class="stats-grid">${[['إجمالي الطلاب',students.length,'♙'],['مرات الحضور',present,'✓'],['إجمالي التحصيل',money(total),'ج.م'],['سجلات الحضور',attendance.length,'▤']].map(x=>`<article class="stat-card"><div class="stat-icon">${x[2]}</div><p>${x[0]}</p><strong>${x[1]}</strong></article>`).join('')}</div><div class="content-grid"><article class="panel"><div class="panel-heading"><h3>آخر سجلات الحضور</h3></div>${table(attendance.slice(0,5),'attendance')}</article><article class="panel"><div class="panel-heading"><h3>آخر المدفوعات</h3></div>${table(payments.slice(0,5),'payments')}</article></div>`}
if(tab==='students'&&(can('view_students')||can('manage_students'))){$('content').innerHTML=`<section class="panel"><div class="panel-heading"><div><h3>إدارة الطلاب</h3><p>إضافة ومتابعة بيانات الطلاب</p></div></div>${can('manage_students')?`<form id="student-form" class="form-grid"><label>اسم الطالب<input name="name" required></label><label>رقم الطالب<input name="student_phone" type="tel" placeholder="01xxxxxxxxx"></label><label>كود الطالب<input name="code" ${academySettings.defaults.autoGenerateCode?"":"required"} pattern="[A-Za-z0-9_-]{1,40}" placeholder="${esc(academySettings.defaults.codePrefix||"ST-")}" title="اتركه فارغًا للتوليد التلقائي أو استخدم حروفًا إنجليزية وأرقامًا وشرطة"></label><label>تاريخ الميلاد<input name="date_of_birth" type="date" max="${localDate()}"></label><label>المجموعة<select name="group_id"><option value="">بدون مجموعة</option>${groups.map(g=>`<option value="${g.id}" ${academySettings.defaults.groupId===g.id?"selected":""}>${esc(g.name)}</option>`).join('')}</select></label>${can('manage_portals')?`<label>كلمة مرور الطالب<input name="student_password" type="password" minlength="6" required autocomplete="new-password"></label>`:""}<label>هاتف ولي الأمر<input name="guardian_phone"></label><label>الرسوم الشهرية<input name="monthly_fee" type="number" min="0" step="0.01" value="${Number(academySettings.defaults.monthlyFee||0)}"></label>${isOwner?`<label class="student-photo-upload-label">صورة الطالب<input name="student_photo" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG أو PNG أو WEBP — حتى 5 ميجابايت</small></label>`:""}<button>＋ إضافة طالب</button></form>`:''}<div class="table-wrap student-table-wrap"><table><thead><tr><th>الطالب</th><th>رقم الطالب</th><th>الكود</th><th>العمر</th><th>المجموعة</th><th>هاتف ولي الأمر</th><th>الرسوم الشهرية</th><th>البطاقة</th>${can('manage_portals')?'<th>حساب الدخول</th>':''}${can('manage_students')?'<th>إجراءات</th>':''}</tr></thead><tbody>${students.map(s=>`<tr><td><span class="student-table-identity">${studentPhotoUrls[s.photo_path]?`<img src="${esc(studentPhotoUrls[s.photo_path])}" alt="" loading="lazy">`:`<span class="student-table-avatar">${esc(String(s.name||'؟').trim().charAt(0)||'؟')}</span>`}<b>${esc(s.name)}</b></span></td><td>${esc(s.student_phone||'—')}</td><td>${esc(s.code||'—')}</td><td>${esc(ageLabel(s.date_of_birth))}</td><td>${esc(groups.find(g=>g.id===s.group_id)?.name||'—')}</td><td>${esc(s.guardian_phone||'—')}</td><td>${money(s.monthly_fee)}</td><td><button class="text-button" data-student-card="${s.id}">طباعة البطاقة</button></td>${can('manage_portals')?`<td><button class="text-button" data-student-login="${s.id}">إنشاء / تغيير كلمة المرور</button></td>`:''}${can('manage_students')?`<td><button class="text-button" data-student-edit="${s.id}">تعديل</button> <button class="text-button danger-action" data-student-delete="${s.id}">حذف</button></td>`:''}</tr>`).join('')}</tbody></table></div><div class="student-mobile-cards">${students.map(s=>`<article class="student-mobile-card"><div class="student-mobile-heading"><span class="student-mobile-person">${studentPhotoUrls[s.photo_path]?`<img src="${esc(studentPhotoUrls[s.photo_path])}" alt="" loading="lazy">`:`<span class="student-table-avatar">${esc(String(s.name||'؟').trim().charAt(0)||'؟')}</span>`}<b>${esc(s.name)}</b></span><span>${esc(ageLabel(s.date_of_birth))}</span></div><div class="student-mobile-meta"><span>الكود: <b>${esc(s.code||'—')}</b></span><span>المجموعة: <b>${esc(groups.find(g=>g.id===s.group_id)?.name||'—')}</b></span><span>الهاتف: <b>${esc(s.student_phone||'—')}</b></span><span>ولي الأمر: <b>${esc(s.guardian_phone||'—')}</b></span><span>الرسوم: <b>${money(s.monthly_fee)}</b></span></div><div class="student-mobile-actions"><button class="text-button" data-student-card="${s.id}">▦ البطاقة</button>${can('manage_students')?`<button class="text-button" data-student-edit="${s.id}">تعديل</button><button class="text-button danger-action" data-student-delete="${s.id}">حذف</button>`:''}${can('manage_portals')?`<button class="text-button" data-student-login="${s.id}">حساب الدخول</button>`:''}</div></article>`).join('')}</div></section>`;if(can('manage_students'))$('student-form').onsubmit=lockForm(async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const studentPassword=f.student_password,studentPhoto=f.student_photo;delete f.student_password;delete f.student_photo;f.code=String(f.code||'').trim()||(academySettings.defaults.autoGenerateCode?(String(academySettings.defaults.codePrefix||'ST-')+Date.now().toString(36).toUpperCase().slice(-7)):'');if(!/^[A-Za-z0-9_-]{1,40}$/.test(f.code)){msg('اكتب كودًا صحيحًا أو فعّل التوليد التلقائي من الإعدادات.');return}try{const created=await run(db.from('students').insert({...f,date_of_birth:f.date_of_birth||null,group_id:f.group_id||null,monthly_fee:Number(f.monthly_fee),owner_id:ownerId||session.user.id}).select('id').single());let photoNotice='';if(studentPhoto instanceof File&&studentPhoto.size){try{const photoPath=await uploadStudentPhotoFile(created.id,studentPhoto);await run(db.from('students').update({photo_path:photoPath}).eq('id',created.id).eq('owner_id',ownerId))}catch(photoError){photoNotice=' لكن تعذر حفظ الصورة: '+photoError.message}}if(studentPassword){const {data,error}=await db.functions.invoke('student-code-auth',{body:{action:'provision',student_id:created.id,password:studentPassword}});if(error||data?.error)throw new Error(data?.error||error.message);msg('تمت إضافة الطالب وإنشاء حسابه. أعطه الكود وكلمة المرور.'+photoNotice)}else msg('تمت إضافة الطالب.'+photoNotice);await load(true)}catch(x){msg(x.message)}});if(can('manage_students')){const editor=document.createElement('form');editor.id='student-edit-form';editor.className='form-grid editor-form';editor.hidden=true;editor.innerHTML='<div class="editor-heading"><h3>تعديل بيانات الطالب</h3><p>عدّل الاسم والكود ورقم ولي الأمر والرسوم، ويمكنك تغيير كلمة المرور أيضًا.</p></div><label>اسم الطالب<input name="name" required minlength="2"></label><label>رقم الطالب<input name="student_phone" type="tel" placeholder="01xxxxxxxxx"></label><label>كود الطالب<input name="code" required pattern="[A-Za-z0-9_-]{1,40}"></label><label>تاريخ الميلاد<input name="date_of_birth" type="date" max="${localDate()}"></label><label>المجموعة<select name="group_id"><option value="">بدون مجموعة</option>'+groups.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name)+'</option>').join('')+'</select></label><label>هاتف ولي الأمر<input name="guardian_phone" type="tel"></label><label>الرسوم الشهرية<input name="monthly_fee" type="number" min="0" required></label>'+(isOwner?'<label class="student-photo-upload-label">صورة جديدة للطالب<input name="student_photo" type="file" accept="image/jpeg,image/png,image/webp"><small>اتركها فارغة للاحتفاظ بالصورة الحالية.</small></label>':'')+(can('manage_portals')?'<label>كلمة مرور جديدة للطالب (اتركها فارغة دون تغيير)<input name="new_password" type="password" minlength="6" autocomplete="new-password"></label>':'')+'<div class="editor-actions"><button type="submit">حفظ التعديلات</button><button type="button" id="student-edit-cancel" class="text-button">إلغاء</button></div>';$('content').querySelector('section.panel').appendChild(editor);$('content').querySelectorAll('[data-student-edit]').forEach(b=>b.onclick=()=>{const st=students.find(x=>x.id===b.dataset.studentEdit);if(!st)return;editor.dataset.studentId=st.id;editor.elements.name.value=st.name||'';editor.elements.student_phone.value=st.student_phone||'';editor.elements.code.value=st.code||'';editor.elements.date_of_birth.value=st.date_of_birth||'';editor.elements.group_id.value=st.group_id||'';editor.elements.guardian_phone.value=st.guardian_phone||'';editor.elements.monthly_fee.value=String(st.monthly_fee??0);if(editor.elements.student_photo)editor.elements.student_photo.value='';if(editor.elements.new_password)editor.elements.new_password.value='';editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'center'})});$('student-edit-cancel').onclick=()=>{editor.hidden=true;editor.reset()};editor.onsubmit=lockForm(async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(editor)),id=editor.dataset.studentId,password=String(f.new_password||'').trim(),studentPhoto=f.student_photo;delete f.student_photo;if(!id||String(f.name).trim().length<2||!/^[A-Za-z0-9_-]{1,40}$/.test(String(f.code).trim())||!Number.isFinite(Number(f.monthly_fee))||Number(f.monthly_fee)<0||(password&&password.length<6)){msg('راجع الاسم والكود والرسوم. كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');return}try{await run(db.from('students').update({name:String(f.name).trim(),student_phone:String(f.student_phone||'').trim(),code:String(f.code).trim(),date_of_birth:f.date_of_birth||null,group_id:f.group_id||null,guardian_phone:String(f.guardian_phone||'').trim(),monthly_fee:Number(f.monthly_fee)}).eq('id',id).eq('owner_id',ownerId));let photoNotice='';if(studentPhoto instanceof File&&studentPhoto.size){try{const oldPath=students.find(x=>x.id===id)?.photo_path||'';const photoPath=await uploadStudentPhotoFile(id,studentPhoto,oldPath);await run(db.from('students').update({photo_path:photoPath}).eq('id',id).eq('owner_id',ownerId))}catch(photoError){photoNotice=' لكن تعذر تحديث الصورة: '+photoError.message}}if(password){const {data,error}=await db.functions.invoke('student-code-auth',{body:{action:'set_password',student_id:id,password}});if(error||data?.error)throw new Error(data?.error||error.message)}editor.hidden=true;await load(true);msg((password?'تم تعديل بيانات الطالب وكلمة مروره.':'تم تعديل بيانات الطالب بنجاح.')+photoNotice)}catch(x){await load(true);msg(x.message)}})};$('content').querySelectorAll('[data-student-card]').forEach(b=>b.onclick=()=>{const st=students.find(x=>x.id===b.dataset.studentCard);if(st)openStudentCard(st)});if(can('manage_students'))$('content').querySelectorAll('[data-student-delete]').forEach(b=>b.onclick=async()=>{const st=students.find(x=>x.id===b.dataset.studentDelete);if(!st)return;if(!confirm('تأكيد حذف الطالب '+st.name+'؟ سيتم حذف سجلات حضوره ومدفوعاته وروابط حساباته المرتبطة به نهائيًا.'))return;try{if(st.photo_path){const {error:photoDeleteError}=await db.storage.from('student-photos').remove([st.photo_path]);if(photoDeleteError)console.warn('Student photo cleanup failed:',photoDeleteError.message)}await run(db.from('students').delete().eq('id',st.id).eq('owner_id',ownerId));await load(true);msg('تم حذف الطالب والسجلات المرتبطة به')}catch(x){msg(x.message)}});if(can('manage_portals'))$('content').querySelectorAll('[data-student-login]').forEach(b=>b.onclick=async()=>{const password=prompt('اكتب كلمة المرور الجديدة للطالب (6 أحرف على الأقل):');if(password===null)return;if(password.length<6){msg('كلمة المرور يجب أن تكون 6 أحرف على الأقل');return}try{const {data,error}=await db.functions.invoke('student-code-auth',{body:{action:'set_password',student_id:b.dataset.studentLogin,password}});if(error||data?.error)throw new Error(data?.error||error.message);msg('تم حفظ كلمة مرور الطالب')}catch(x){msg(x.message)}});}
if(tab==='groups'&&role==='owner'){
 const root=$('content');
 root.innerHTML=`<section class="panel">
  <div class="panel-heading"><div><h3>إدارة مجموعات الطلاب</h3><p>أنشئ مجموعاتك، ثم اختر المجموعة عند إضافة الطالب أو تعديل بياناته.</p></div></div>
  <form id="group-form" class="form-grid group-form"><label>اسم المجموعة<input name="name" required minlength="2" maxlength="80" placeholder="مثال: مجموعة السبت أو الصف الأول"></label><button type="submit">＋ إنشاء مجموعة</button></form>
  <div class="table-wrap"><table><thead><tr><th>اسم المجموعة</th><th>عدد الطلاب</th><th>إجراءات</th></tr></thead><tbody>${groups.length?groups.map(g=>`<tr><td><b>${esc(g.name)}</b></td><td>${students.filter(s=>s.group_id===g.id).length}</td><td><button type="button" class="text-button" data-group-edit="${g.id}">تعديل الاسم</button> <button type="button" class="text-button danger-action" data-group-delete="${g.id}">حذف المجموعة</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty-row">لم تنشئ مجموعات بعد.</td></tr>'}</tbody></table></div>
  <p class="muted">حذف المجموعة لا يحذف الطلاب؛ سيصبحون فقط «بدون مجموعة» ويمكنك إسنادهم لمجموعة أخرى لاحقًا.</p>
 </section>`;
 $('group-form').onsubmit=lockForm(async e=>{
  e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')||'').trim();
  if(name.length<2){msg('اكتب اسم مجموعة من حرفين على الأقل.');return}
  try{await run(db.from('student_groups').insert({owner_id:ownerId,name}));await load(true);msg('تم إنشاء المجموعة.')}
  catch(x){msg(/duplicate|unique/i.test(x.message)?'يوجد مجموعة بنفس الاسم بالفعل.':x.message)}
 });
 root.querySelectorAll('[data-group-edit]').forEach(button=>button.onclick=async()=>{
  const group=groups.find(g=>g.id===button.dataset.groupEdit);if(!group)return;
  const name=prompt('اسم المجموعة الجديد:',group.name);if(name===null)return;
  const clean=name.trim();if(clean.length<2||clean.length>80){msg('اسم المجموعة يجب أن يكون من حرفين إلى 80 حرفًا.');return}
  try{await run(db.from('student_groups').update({name:clean}).eq('id',group.id).eq('owner_id',ownerId));await load(true);msg('تم تعديل اسم المجموعة.')}
  catch(x){msg(/duplicate|unique/i.test(x.message)?'يوجد مجموعة بنفس الاسم بالفعل.':x.message)}
 });
 root.querySelectorAll('[data-group-delete]').forEach(button=>button.onclick=async()=>{
  const group=groups.find(g=>g.id===button.dataset.groupDelete);if(!group)return;
  const count=students.filter(s=>s.group_id===group.id).length;
  if(!confirm('حذف مجموعة «'+group.name+'»؟'+(count?' سيتم فك ربط '+count+' طالبًا بها دون حذف ملفاتهم.':'')))return;
  try{await run(db.from('student_groups').delete().eq('id',group.id).eq('owner_id',ownerId));await load(true);msg('تم حذف المجموعة مع الاحتفاظ بملفات الطلاب.')}
  catch(x){msg(x.message)}
 });
 return;
}
if(tab==='attendance'){
 const mayManage=can('manage_attendance'),recent=attendance.slice(0,30);attendanceSelectedStudentId='';
 $('content').innerHTML=
 '<div class=\'attendance-page\'> '+
 '<div class=\'attendance-page-heading\'><div><p class=\'eyebrow\'>لوحة التحكم</p><h2>الحضور والغياب</h2><p class=\'muted\'>تسجيل حضور وغياب الطلاب بسهولة</p></div><div class=\'attendance-heading-actions\'><button type=\'button\' class=\'attendance-outline-button\' id=\'attendance-focus-search\'>⌕ البحث عن طالب</button><button type=\'button\' class=\'attendance-primary-button\' id=\'attendance-top-camera\'>▣ فتح الكاميرا</button></div></div> '+
 '<section class=\'attendance-panel\'><div class=\'attendance-panel-heading\'><div><h3>سجل الحضور</h3><p>سجّل الحضور بالباركود أو ابحث عن الطالب</p></div></div> '+
 (mayManage?'<div class=\'attendance-session-grid\'><label>تاريخ الجلسة<input id=\'attendance-session-date\' type=\'date\' value=\''+localDate()+'\' required></label><label>اختر الجلسة<select id=\'attendance-session-name\'><option ${academySettings.defaults.attendanceSession==="الجلسة الأولى"?"selected":""}>الجلسة الأولى</option><option ${academySettings.defaults.attendanceSession==="الجلسة الثانية"?"selected":""}>الجلسة الثانية</option><option ${academySettings.defaults.attendanceSession==="الجلسة الثالثة"?"selected":""}>الجلسة الثالثة</option><option ${academySettings.defaults.attendanceSession==="المراجعة"?"selected":""}>المراجعة</option><option ${academySettings.defaults.attendanceSession==="الامتحان"?"selected":""}>الامتحان</option></select></label></div> '+
 '<label class=\'attendance-search-label\'>بحث عن الطالب<input id=\'attendance-search\' type=\'search\' placeholder=\'اكتب اسم الطالب أو الهاتف أو كود الطالب\'></label><div id=\'attendance-search-results\' class=\'attendance-search-results\' hidden></div> '+
 '<div class=\'attendance-mode-heading\'><h3>تسجيل الحضور</h3><p>اختر طريقة التسجيل</p></div><div class=\'attendance-mode-grid\'><button type=\'button\' class=\'attendance-mode-button active\' data-attendance-mode=\'camera\'><span>▣</span><b>الكاميرا</b></button><button type=\'button\' class=\'attendance-mode-button\' data-attendance-mode=\'barcode\'><span>▥</span><b>الباركود</b></button><button type=\'button\' class=\'attendance-mode-button\' data-attendance-mode=\'search\'><span>⌕</span><b>البحث</b></button><button type=\'button\' class=\'attendance-mode-button\' data-attendance-mode=\'manual\'><span>✎</span><b>تسجيل يدوي</b></button></div> '+
 '<div class=\'attendance-tools\'><div id=\'attendance-camera-panel\' class=\'attendance-tool-panel\'><div class=\'attendance-camera-frame\'><div id=\'camera-reader\' hidden></div><div id=\'attendance-camera-placeholder\' class=\'attendance-camera-placeholder\'><span>▣</span><b>الكاميرا غير مفعّلة</b><small>اضغط على فتح الكاميرا لبدء المسح</small></div></div><button type=\'button\' id=\'camera-scan-start\' class=\'attendance-primary-button attendance-wide-button\'>▣ فتح الكاميرا</button></div> '+
 '<div id=\'attendance-barcode-panel\' class=\'attendance-tool-panel\' hidden><div class=\'attendance-tool-help\'><b>استخدام قارئ الباركود</b><p>ضع المؤشر في الخانة ثم امسح كود الطالب.</p></div><form id=\'attendance-scan-form\' class=\'attendance-barcode-form\'><input id=\'attendance-scan-code\' type=\'text\' autocomplete=\'off\' placeholder=\'امسح الباركود أو اكتب الكود\' required><button type=\'submit\' class=\'attendance-primary-button\'>قراءة الكود</button></form></div> '+
 '<div id=\'attendance-search-panel\' class=\'attendance-tool-panel\' hidden><div class=\'attendance-tool-help\'><b>البحث عن طالب</b><p>ابحث بالاسم أو الهاتف أو الكود ثم اختره.</p></div><input id=\'attendance-search-secondary\' type=\'search\' placeholder=\'ابحث عن الطالب…\'><div id=\'attendance-search-secondary-results\' class=\'attendance-search-results\'></div></div> '+
 '<div id=\'attendance-manual-panel\' class=\'attendance-tool-panel\' hidden><div class=\'attendance-tool-help\'><b>التسجيل اليدوي</b><p>اختر الطالب والحالة ثم أكد التسجيل.</p></div><div class=\'attendance-manual-grid\'><label>الطالب<select id=\'attendance-manual-student\'><option value=\'\'>اختر الطالب</option>'+students.map(s=>'<option value=\''+esc(s.id)+'\'>'+esc(s.name)+' — '+esc(s.code||'بدون كود')+'</option>').join('')+'</select></label><label>الحالة<select id=\'attendance-manual-status\'><option value=\'حاضر\'>حاضر</option><option value=\'غائب\'>غائب</option><option value=\'متأخر\'>متأخر</option><option value=\'بعذر\'>بعذر</option></select></label></div></div></div> '+
 '<div id=\'attendance-selected\' class=\'attendance-selected-card\' hidden><div class=\'attendance-selected-heading\'><b>الطالب المحدد</b><span>جاهز للتسجيل</span></div><div class=\'attendance-selected-details\'><div><small>الطالب</small><b id=\'attendance-selected-name\'>—</b></div><div><small>الكود</small><b id=\'attendance-selected-code\'>—</b></div><div><small>المجموعة</small><b id=\'attendance-selected-group\'>—</b></div><div><small>الهاتف</small><b id=\'attendance-selected-phone\'>—</b></div></div><div class=\'attendance-selected-actions\'><button type=\'button\' id=\'attendance-confirm\' class=\'attendance-primary-button\'>✓ تسجيل حضور</button><button type=\'button\' id=\'attendance-cancel\' class=\'attendance-outline-button\'>إلغاء</button></div></div><p id=\'attendance-feedback\' class=\'attendance-feedback\' aria-live=\'polite\'>اختر طريقة التسجيل لبدء تحديد الطالب.</p></section> '+
 '<section class=\'attendance-history-panel\'><div class=\'attendance-panel-heading\'><div><h3>آخر سجلات الحضور</h3><p>أحدث العمليات المسجلة في أكاديميا</p></div><span class=\'attendance-history-count\'>'+recent.length+' سجل</span></div><div class=\'table-wrap\'><table class=\'attendance-history-table\'><thead><tr><th>الوقت</th><th>الطالب</th><th>المجموعة</th><th>الجلسة</th><th>التاريخ</th><th>الحالة</th>'+(mayManage?'<th>إجراءات</th>':'')+'</tr></thead><tbody>'+(recent.length?recent.map(r=>{const s=students.find(x=>x.id===r.student_id),tm=r.created_at?new Date(r.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'—',cl=r.status==='حاضر'?'good':r.status==='غائب'?'bad':'warn';return '<tr><td>'+tm+'</td><td>'+esc(s?.name||'طالب')+'</td><td>'+esc(groups.find(g=>g.id===s?.group_id)?.name||'—')+'</td><td>'+esc(r.session_name||'الجلسة الأولى')+'</td><td>'+dateText(r.session_date)+'</td><td><span class=\'status '+cl+'\'>'+esc(r.status)+'</span></td>'+(mayManage?'<td><button type=\'button\' class=\'text-button\' data-record-edit=\'attendance\' data-record-id=\''+r.id+'\'>تعديل</button> <button type=\'button\' class=\'text-button danger-action\' data-record-delete=\'attendance\' data-record-id=\''+r.id+'\'>حذف</button></td>':'')+'</tr>'}).join(''):'<tr><td colspan=\'7\' class=\'empty-row\'>لا توجد سجلات حضور حتى الآن.</td></tr>')+'</tbody></table></div></section></div>' : '<section class=\'attendance-panel\'><p class=\'empty-row\'>لا توجد صلاحية لتسجيل الحضور.</p></section>') + '</div>';
 if(mayManage){
  const setMode=mode=>{attendanceMode=mode;document.querySelectorAll('[data-attendance-mode]').forEach(b=>b.classList.toggle('active',b.dataset.attendanceMode===mode));['camera','barcode','search','manual'].forEach(k=>{const p=$('attendance-'+k+'-panel');if(p)p.hidden=k!==mode});if(mode==='search')$('attendance-search-secondary')?.focus();if(mode==='barcode')$('attendance-scan-code')?.focus()};
  document.querySelectorAll('[data-attendance-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.attendanceMode));
  const bindSearch=(inputId,targetId)=>{const input=$(inputId),target=$(targetId);input.oninput=()=>{const q=input.value.trim().toLowerCase(),rows=students.filter(s=>!q||[s.name,s.code,s.student_phone,s.guardian_phone].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);target.hidden=false;target.innerHTML=rows.map(s=>'<button type=\'button\' class=\'attendance-search-result\' data-attendance-pick=\''+esc(s.id)+'\'><b>'+esc(s.name)+'</b><small>'+esc(s.code||'—')+' · '+esc(groups.find(g=>g.id===s.group_id)?.name||'بدون مجموعة')+'</small><span>اختيار ←</span></button>').join('')||'<p class=\'attendance-no-results\'>لا يوجد طالب مطابق.</p>';target.querySelectorAll('[data-attendance-pick]').forEach(b=>b.onclick=()=>selectAttendanceStudent(b.dataset.attendancePick))}};
  bindSearch('attendance-search','attendance-search-results');bindSearch('attendance-search-secondary','attendance-search-secondary-results');
  $('attendance-focus-search').onclick=()=>{setMode('search');$('attendance-search').focus()};
  $('attendance-top-camera').onclick=()=>{setMode('camera');void startAttendanceCamera()};
  $('attendance-manual-student').onchange=()=>{if($('attendance-manual-student').value)selectAttendanceStudent($('attendance-manual-student').value)};
  $('attendance-scan-form').onsubmit=async e=>{e.preventDefault();const input=$('attendance-scan-code'),value=input.value.trim();if(!value)return;input.value='';await markAttendanceFromCode(value);input.focus()};
  $('camera-scan-start').onclick=async()=>{await startAttendanceCamera();$('attendance-camera-placeholder').hidden=!!activeAttendanceScanner};
  $('attendance-confirm').onclick=()=>registerSelectedAttendance(attendanceMode==='manual'?$('attendance-manual-status').value:'حاضر');
  $('attendance-cancel').onclick=()=>{attendanceSelectedStudentId='';$('attendance-selected').hidden=true;$('attendance-feedback').textContent='تم إلغاء تحديد الطالب.'};
  setMode('camera');
 }
}
if(tab==='payments'&&(can('view_payments')||can('manage_payments')||role==='guardian')){$('content').innerHTML=`<section class="panel"><div class="panel-heading"><h3>المدفوعات</h3><b class="amount-total">${money(total)}</b></div>${can('manage_payments')?`<form id="payment-form" class="form-grid"><label>الطالب<select name="student_id" required>${students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>المبلغ<input name="amount" type="number" min="1" required></label><label>تاريخ الدفع<input name="paid_at" type="date" value="${localDate()}"></label><label>ملاحظة<input name="note"></label><button>＋ تسجيل دفعة</button></form>`:''}${table(payments,'payments')}</section>`;if(can('manage_payments'))$('payment-form').onsubmit=lockForm(async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await run(db.from('payments').insert({...f,amount:Number(f.amount),owner_id:ownerId||session.user.id}));await load(true);msg('تم تسجيل الدفعة')}catch(x){msg(x.message)}});}
if(tab==='portals'&&(role==='owner'||can('manage_portals'))){$('content').innerHTML=`<section class="panel"><div class="panel-heading"><div><h3>ربط حسابات ولي الأمر والطالب</h3><p>يجب أن يسجل صاحب الحساب بنفس البريد الإلكتروني الذي تضيفه هنا</p></div></div>${can('manage_portals')?`<form id="link-form" class="form-grid"><label>الطالب<select name="student_id" required>${students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>البريد الإلكتروني<input name="portal_email" type="email" required></label><label>نوع الحساب<select name="portal_role"><option value="guardian">ولي أمر</option><option value="student">طالب</option></select></label><button>＋ ربط الحساب</button></form>`:''}<div class="table-wrap"><table><thead><tr><th>الطالب</th><th>البريد</th><th>نوع الحساب</th><th>إجراءات</th></tr></thead><tbody>${links.map(l=>`<tr><td>${esc(students.find(s=>s.id===l.student_id)?.name||'—')}</td><td>${esc(l.portal_email)}</td><td>${l.portal_role==='guardian'?'ولي أمر':'طالب'}</td><td><button class="text-button" data-edit-link="${l.id}">تعديل</button> <button class="text-button danger-action" data-delete-link="${l.id}">حذف</button></td></tr>`).join('')}</tbody></table></div></section>`;if(can('manage_portals'))$('link-form').onsubmit=lockForm(async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await run(db.from('student_portal_links').insert({...f,portal_email:f.portal_email.trim().toLowerCase(),owner_id:ownerId||session.user.id}));await load(true);msg('تم ربط الحساب. على ولي الأمر أو الطالب التسجيل بنفس البريد.')}catch(x){msg(x.message)}});}
if(tab==='supervisors'&&role==='owner'){$('content').innerHTML=`<section class="panel"><div class="panel-heading"><div><h3>إضافة مشرف وتحديد صلاحياته</h3><p>المشرف ينشئ حسابًا بالبريد نفسه الذي تضيفه هنا</p></div></div><form id="supervisor-form" class="form-grid supervisor-form"><label>اسم المشرف<input name="supervisor_name" required minlength="2"></label><label>رقم الهاتف<input name="supervisor_phone" type="tel" placeholder="01xxxxxxxxx"></label><label>البريد الإلكتروني<input name="supervisor_email" type="email" required></label><fieldset class="permission-list"><legend>الصلاحيات</legend>${[['view_students','عرض الطلاب'],['manage_students','إضافة وإدارة الطلاب'],['view_attendance','عرض الحضور'],['manage_attendance','تسجيل وإدارة الحضور'],['view_payments','عرض المدفوعات'],['manage_payments','تسجيل وإدارة المدفوعات'],['manage_portals','إدارة حسابات الطلاب وأولياء الأمور']].map(([k,n])=>`<label><input type="checkbox" name="perm_${k}" value="1"> ${n}</label>`).join('')}</fieldset><button>＋ إضافة المشرف</button></form><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>البريد</th><th>الحالة</th><th>الصلاحيات</th><th>إجراءات</th></tr></thead><tbody>${supervisors.map(x=>`<tr><td>${esc(x.supervisor_name)}</td><td>${esc(x.supervisor_phone||'—')}</td><td>${esc(x.supervisor_email)}</td><td>${x.active?'نشط':'موقوف'}</td><td>${Object.entries(x.permissions||{}).filter(([,v])=>v).length} صلاحية</td><td><button class="text-button" data-edit-supervisor="${x.id}">تعديل</button> <button class="text-button" data-supervisor-reset="${x.id}">إرسال رابط تغيير كلمة المرور</button> <button class="text-button" data-toggle-supervisor="${x.id}">${x.active?'إيقاف':'تفعيل'}</button> <button class="text-button danger-action" data-delete-supervisor="${x.id}">حذف</button></td></tr>`).join('')}</tbody></table></div><form id="supervisor-edit-form" class="form-grid supervisor-form editor-form" hidden><div class="editor-heading"><h3>تعديل بيانات المشرف</h3><p>لو غيرت البريد، لازم يكون مطابقًا لبريد حساب تسجيل الدخول الخاص بالمشرف.</p></div><label>اسم المشرف<input name="supervisor_name" required minlength="2"></label><label>رقم الهاتف<input name="supervisor_phone" type="tel" placeholder="01xxxxxxxxx"></label><label>البريد الإلكتروني<input name="supervisor_email" type="email" required></label><fieldset class="permission-list"><legend>الصلاحيات</legend><label><input type="checkbox" name="perm_view_students" value="1"> عرض الطلاب</label><label><input type="checkbox" name="perm_manage_students" value="1"> إضافة وإدارة الطلاب</label><label><input type="checkbox" name="perm_view_attendance" value="1"> عرض الحضور</label><label><input type="checkbox" name="perm_manage_attendance" value="1"> تسجيل وإدارة الحضور</label><label><input type="checkbox" name="perm_view_payments" value="1"> عرض المدفوعات</label><label><input type="checkbox" name="perm_manage_payments" value="1"> تسجيل وإدارة المدفوعات</label><label><input type="checkbox" name="perm_manage_portals" value="1"> إدارة حسابات الطلاب وأولياء الأمور</label></fieldset><div class="editor-actions"><button type="submit">حفظ بيانات المشرف</button><button type="button" id="supervisor-edit-cancel" class="text-button">إلغاء</button></div></form></section>`;
$('supervisor-form').onsubmit=lockForm(async e=>{e.preventDefault();const fd=new FormData(e.target),perms={};for(const k of ['view_students','manage_students','view_attendance','manage_attendance','view_payments','manage_payments','manage_portals'])perms[k]=fd.get('perm_'+k)==='1';if(perms.manage_students)perms.view_students=true;if(perms.manage_attendance)perms.view_attendance=true;if(perms.manage_payments)perms.view_payments=true;try{await run(db.from('supervisor_access').insert({owner_id:ownerId,supervisor_name:String(fd.get('supervisor_name')).trim(),supervisor_phone:String(fd.get('supervisor_phone')||'').trim(),supervisor_email:String(fd.get('supervisor_email')).trim().toLowerCase(),permissions:perms}));await load(true);tab='supervisors';drawNav();render();msg('تمت إضافة المشرف. عليه إنشاء حساب بالبريد نفسه.')}catch(x){msg(x.message)}});
const supervisorEditor=$('supervisor-edit-form');$('content').querySelectorAll('[data-edit-supervisor]').forEach(b=>b.onclick=()=>{const row=supervisors.find(x=>x.id===b.dataset.editSupervisor);if(!row)return;supervisorEditor.dataset.supervisorId=row.id;supervisorEditor.elements.supervisor_name.value=row.supervisor_name||'';supervisorEditor.elements.supervisor_phone.value=row.supervisor_phone||'';supervisorEditor.elements.supervisor_email.value=row.supervisor_email||'';for(const key of ['view_students','manage_students','view_attendance','manage_attendance','view_payments','manage_payments','manage_portals'])supervisorEditor.elements['perm_'+key].checked=row.permissions?.[key]===true;supervisorEditor.hidden=false;supervisorEditor.scrollIntoView({behavior:'smooth',block:'center'})});$('supervisor-edit-cancel').onclick=()=>{supervisorEditor.hidden=true;supervisorEditor.reset()};supervisorEditor.onsubmit=lockForm(async e=>{e.preventDefault();const fd=new FormData(supervisorEditor),id=supervisorEditor.dataset.supervisorId,name=String(fd.get('supervisor_name')||'').trim(),phone=String(fd.get('supervisor_phone')||'').trim(),email=String(fd.get('supervisor_email')||'').trim().toLowerCase();if(!id||name.length<2||!/^\S+@\S+\.\S+$/.test(email)){msg('راجع اسم المشرف والبريد الإلكتروني');return}const keys=['view_students','manage_students','view_attendance','manage_attendance','view_payments','manage_payments','manage_portals'],perms=Object.fromEntries(keys.map(k=>[k,fd.get('perm_'+k)==='1']));for(const k of ['manage_students','manage_attendance','manage_payments'])if(perms[k])perms[k.replace('manage_','view_')]=true;try{await run(db.from('supervisor_access').update({supervisor_name:name,supervisor_phone:phone,supervisor_email:email,permissions:perms}).eq('id',id).eq('owner_id',ownerId));supervisorEditor.hidden=true;await load(true);tab='supervisors';drawNav();render();msg('تم تحديث بيانات وصلاحيات المشرف. تأكد من تطابق البريد مع حساب دخوله.')}catch(x){msg(x.message)}});$('content').querySelectorAll('[data-supervisor-reset]').forEach(b=>b.onclick=async()=>{const row=supervisors.find(x=>x.id===b.dataset.supervisorReset);if(!row)return;if(!confirm('إرسال رابط تغيير كلمة المرور إلى '+row.supervisor_email+'؟'))return;try{const {error}=await db.auth.resetPasswordForEmail(row.supervisor_email,{redirectTo:window.location.origin+window.location.pathname});if(error)throw error;msg('تم طلب إرسال رابط تغيير كلمة المرور إلى بريد المشرف.');}catch(x){msg(authErrorText(x));}});$('content').querySelectorAll('[data-delete-supervisor]').forEach(b=>b.onclick=async()=>{const row=supervisors.find(x=>x.id===b.dataset.deleteSupervisor);if(!row)return;if(!confirm('حذف المشرف '+row.supervisor_name+' من أكاديميتك؟ لن يتم حذف حساب تسجيل الدخول الشخصي لديه.'))return;try{await run(db.from('supervisor_access').delete().eq('id',row.id).eq('owner_id',ownerId));await load(true);tab='supervisors';drawNav();render();msg('تم حذف المشرف من الأكاديمية')}catch(x){msg(x.message)}});$('content').querySelectorAll('[data-toggle-supervisor]').forEach(b=>b.onclick=async()=>{const row=supervisors.find(x=>x.id===b.dataset.toggleSupervisor);if(!row)return;try{await run(db.from('supervisor_access').update({active:!row.active}).eq('id',row.id).eq('owner_id',ownerId));await load(true);tab='supervisors';drawNav();render()}catch(x){msg(x.message)}});}
if(tab==='messages'){renderMessages();}
}

function renderAIImportPreview(rows){
 const root=$('ai-import-results');root.innerHTML=rows.map((r,i)=>`<article class="panel ai-student-row" data-ai-row="${i}"><label><input type="checkbox" class="ai-include" checked> تضمين هذا الطالب</label><div class="form-grid"><label>اسم الطالب<input data-field="name" value="${esc(r.name||'')}" required></label><label>هاتف الطالب<input data-field="student_phone" value="${esc(r.student_phone||'')}"></label><label>هاتف ولي الأمر<input data-field="guardian_phone" value="${esc(r.guardian_phone||'')}"></label><label>الرسوم الشهرية<input data-field="monthly_fee" type="number" min="0" value="${Number(r.monthly_fee||0)}"></label><label>تاريخ الميلاد<input data-field="date_of_birth" type="date" value="${/^\\d{4}-\\d{2}-\\d{2}$/.test(r.date_of_birth||'')?esc(r.date_of_birth):''}"></label><label>الكود<input data-field="code" value="${esc(r.code||('AI'+Date.now().toString(36).toUpperCase()+String(i+1)))}"></label><label>ملاحظات<input data-field="notes" value="${esc(r.notes||'')}"></label></div></article>`).join('')+`<button type="button" id="ai-save-selected" class="ai-primary-btn ai-save-btn">✓ حفظ الطلاب المحددين</button>`;
 $('ai-save-selected').onclick=async()=>{const selected=[...root.querySelectorAll('.ai-student-row')].filter(row=>row.querySelector('.ai-include').checked);if(!selected.length){msg('حدد طالبًا واحدًا على الأقل.');return}if(!confirm('سيتم حفظ '+selected.length+' طالبًا في حسابك. هل راجعت البيانات وتريد المتابعة؟'))return;const button=$('ai-save-selected');button.disabled=true;try{const records=selected.map(row=>{const v=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value.trim()]));if(!v.name||!v.code)throw new Error('اسم الطالب والكود مطلوبان لكل سجل محدد.');return {...v,date_of_birth:v.date_of_birth||null,monthly_fee:Number(v.monthly_fee||0),owner_id:ownerId||session.user.id}});await run(db.from('students').insert(records));await load(true);tab='students';drawNav();render();msg('تم حفظ '+records.length+' طالبًا بعد مراجعتك.')}catch(x){msg(x.message||'تعذر حفظ الطلاب.')}finally{if(button.isConnected)button.disabled=false}};
}

async function renderMessages(){
 if(messageRefreshTimer){clearInterval(messageRefreshTimer);messageRefreshTimer=null;}
 const view=++messageViewVersion;
 $('content').innerHTML=`<section class="panel message-panel">
  <div class="message-page-heading">
   <div><p class="eyebrow">صندوق الوارد</p><h2>الرسائل والمحادثات</h2><p class="muted">محادثات خاصة مع أولياء الأمور والطلاب والمشرفين</p></div>
   <button id="message-refresh" class="message-refresh-button" type="button"><span>↻</span> تحديث</button>
  </div>
  <div class="messages-layout">
   <aside class="message-contacts-panel">
    <div class="message-section-heading"><h3>جهات الاتصال</h3><span id="message-contact-count">—</span></div>
    <div id="message-contact-list" class="message-contact-list"><p class="empty-row">جار تحميل جهات الاتصال…</p></div>
   </aside>
   <section class="message-conversation-panel">
    <header class="message-conversation-header">
     <div class="message-peer-avatar" id="message-peer-avatar">؟</div>
     <div class="message-peer-identity"><h3 id="message-peer-name">اختر محادثة</h3><p id="message-peer-role">ستظهر الرسائل هنا</p></div>
     <span class="message-online-mark" aria-hidden="true"></span>
    </header>
    <div id="message-thread" class="message-thread"><p class="empty-row">اختر جهة اتصال لعرض المحادثة.</p></div>
    <form id="message-send-form" class="message-compose" hidden>
     <label class="message-compose-label" for="message-body">اكتب رسالتك</label>
     <select id="message-template-select" class="message-template-select"><option value="">رسالة فارغة</option><option value="welcome">ترحيب</option><option value="attendance">متابعة الحضور</option><option value="absence">إشعار غياب</option><option value="payment">تذكير الرسوم</option></select>
     <div class="message-compose-row"><textarea id="message-body" name="message_body" rows="2" maxlength="4000" required placeholder="اكتب رسالتك هنا…"></textarea><button type="submit" aria-label="إرسال الرسالة">إرسال <span>↗</span></button></div>
    </form>
    <p id="message-help" class="message-help">الرسائل تظهر داخل حساب أكاديميا للطرف الآخر. لا يتم إرسال SMS أو واتساب أو بريد تلقائيًا.</p>
   </section>
  </div>
 </section>`;
 try{
  const {data,error}=await db.functions.invoke('academia-messages',{body:{action:'contacts'}});
  if(error)throw error;if(data?.error)throw new Error(data.error);
  if(view!==messageViewVersion||tab!=='messages')return;
  messageContacts=Array.isArray(data?.contacts)?data.contacts:[];unreadBySender=data?.unread_by_sender||unreadBySender;unreadTotal=Number(data?.unread_total??unreadTotal);drawNav();
  const roleLabels={owner:'الإدارة',supervisor:'مشرف',student:'طالب',guardian:'ولي أمر'};
  const contactList=$('message-contact-list');
  $('message-contact-count').textContent=String(messageContacts.length);
  if(!messageContacts.length){
   contactList.innerHTML='<p class="message-empty-contacts">لا توجد جهات اتصال متاحة حاليًا.</p>';
   $('message-thread').innerHTML='<div class="message-welcome-empty"><span>✉</span><b>لا توجد محادثات بعد</b><p>أضف مشرفًا بحساب فعّال، أو أنشئ حساب دخول للطالب أو اربط حساب بوابة.</p></div>';
   $('message-send-form').hidden=true;
   $('message-help').textContent='لن تظهر جهة الاتصال إلا بعد إنشاء حساب دخول أو ربط حساب بوابة فعّال.';
   $('message-refresh').onclick=()=>renderMessages();
   return;
  }
  if(!messageContacts.some(c=>c.id===activeMessagePeerId))activeMessagePeerId=messageContacts[0].id;
  const drawContacts=()=>{
   contactList.innerHTML=messageContacts.map(c=>{
    const selected=c.id===activeMessagePeerId,letter=String(c.name||'؟').trim().charAt(0)||'؟';
    return '<button type="button" class="message-contact-item '+(selected?'active':'')+'" data-message-peer="'+esc(c.id)+'"><span class="message-contact-avatar">'+esc(letter)+'</span><span class="message-contact-copy"><b>'+esc(c.name||'حساب أكاديميا')+'</b><small>'+esc(roleLabels[c.role]||'حساب')+'</small></span>'+(Number(c.unread_count)>0?'<span class="message-unread-badge">'+Math.min(99,Number(c.unread_count))+'</span>':'')+'</button>';
   }).join('');
   contactList.querySelectorAll('[data-message-peer]').forEach(button=>button.onclick=()=>{
    activeMessagePeerId=button.dataset.messagePeer;drawContacts();void loadMessageThread(view);
   });
  };
  drawContacts();
  $('message-refresh').onclick=()=>loadMessageThread(view);
  await loadMessageThread(view);
  const templateSelect=$('message-template-select');
  if(templateSelect)templateSelect.onchange=()=>{const key=templateSelect.value;if(!key)return;const peer=messageContacts.find(c=>c.id===activeMessagePeerId);const template=academySettings?.messages?.templates?.[key]||DEFAULT_ACADEMY_SETTINGS.messages.templates[key];const body=fillAcademyTemplate(template,{academy:academySettings?.profile?.academyName||'أكاديميا',student:peer?.name||'الطالب',status:'حاضر',date:localDate(),session:academySettings?.defaults?.attendanceSession||'الجلسة الأولى',amount:''});const signature=academySettings?.messages?.signature;$('message-body').value=body+(signature?'\\n'+signature:'')};
  messageRefreshTimer=setInterval(()=>{if(tab==='messages'&&!document.hidden){void loadMessageThread(view).catch(e=>msg('تعذر تحديث المحادثة: '+e.message));void refreshUnreadCounts();}},5000);
 }catch(e){
  if(view!==messageViewVersion)return;
  $('message-thread').innerHTML='<div class="message-welcome-empty"><span>!</span><b>تعذر تحميل المحادثات</b><p>'+esc(e.message||'حاول تحديث الصفحة.')+'</p></div>';
  $('message-help').textContent='تحقق من الاتصال ثم حاول مرة أخرى.';
 }
}
async function loadMessageThread(view){
 const peerId=activeMessagePeerId;
 if(!peerId)return;
 const {data,error}=await db.functions.invoke('academia-messages',{body:{action:'list',peer_id:peerId}});
 if(error)throw error;if(data?.error)throw new Error(data.error);
 if(view!==messageViewVersion||tab!=='messages')return;
 const peer=messageContacts.find(c=>c.id===peerId);
 if(peer){
  $('message-peer-name').textContent=peer.name||'حساب أكاديميا';
  $('message-peer-role').textContent=({owner:'الإدارة',supervisor:'مشرف',student:'طالب',guardian:'ولي أمر'}[peer.role]||'حساب');
  $('message-peer-avatar').textContent=String(peer.name||'؟').trim().charAt(0)||'؟';
 }
 const rows=Array.isArray(data?.messages)?data.messages:[];
 $('message-thread').innerHTML=rows.length?rows.map(m=>{
  const mine=m.sender_id===session?.user?.id;
  const stamp=m.created_at?new Date(m.created_at).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const receipt=mine?(m.read_at?'✓ تمت القراءة':'✓ تم الإرسال'):'';
  return '<article class="message-bubble '+(mine?'mine':'theirs')+'"><time class="message-time">'+esc(stamp)+'</time><p>'+esc(m.body)+'</p>'+(mine?'<small class="message-receipt">'+receipt+'</small>':'')+'</article>';
 }).join(''):'<div class="message-welcome-empty"><span>✉</span><b>ابدأ المحادثة</b><p>لا توجد رسائل هنا بعد. اكتب أول رسالة في الأسفل.</p></div>';
 $('message-thread').scrollTop=$('message-thread').scrollHeight;
 const form=$('message-send-form');form.hidden=false;
 form.onsubmit=async e=>{
  e.preventDefault();if(form.dataset.busy==='true')return;
  const input=$('message-body'),body=input.value.trim();if(!body)return;
  form.dataset.busy='true';const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.innerHTML='جار الإرسال…';
  try{
   const {data:sent,error:sendError}=await db.functions.invoke('academia-messages',{body:{action:'send',peer_id:peerId,message:body}});
   if(sendError)throw sendError;if(sent?.error)throw new Error(sent.error);
   input.value='';await loadMessageThread(view);await refreshUnreadCounts();
  }catch(x){msg(x.message||'تعذر إرسال الرسالة');}
  finally{form.dataset.busy='false';if(btn.isConnected){btn.disabled=false;btn.innerHTML='إرسال <span>↗</span>';}}
 };
}

$('content').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit-link]'),del=e.target.closest('[data-delete-link]');if(!edit&&!del)return;const id=(edit||del).dataset.editLink||(edit||del).dataset.deleteLink,row=links.find(x=>x.id===id);if(!row)return;if(del){if(!confirm('تأكيد حذف ربط حساب البوابة؟'))return;try{await run(db.from('student_portal_links').delete().eq('id',id).eq('owner_id',ownerId));await load(true);msg('تم حذف ربط الحساب')}catch(x){msg(x.message)}return}const email=prompt('البريد الإلكتروني للحساب:',row.portal_email);if(email===null)return;const portal_role=prompt('نوع الحساب: guardian أو student',row.portal_role);if(portal_role===null)return;if(!/^\S+@\S+\.\S+$/.test(email.trim())||!['guardian','student'].includes(portal_role.trim())){msg('راجع البريد ونوع الحساب');return}try{await run(db.from('student_portal_links').update({portal_email:email.trim().toLowerCase(),portal_role:portal_role.trim()}).eq('id',id).eq('owner_id',ownerId));await load(true);msg('تم تعديل ربط الحساب')}catch(x){msg(x.message)}});
// Delegated handlers remain active when the tables are re-rendered.
$('content').addEventListener('click',async e=>{const b=e.target.closest('[data-record-delete],[data-record-edit]');if(!b)return;const kind=b.dataset.recordDelete||b.dataset.recordEdit,id=b.dataset.recordId;if(b.dataset.recordDelete){if(!confirm(kind==='attendance'?'تأكيد حذف سجل الحضور؟':'تأكيد حذف سجل الدفعة؟'))return;try{const tableName=kind==='attendance'?'attendance':'payments';await run(db.from(tableName).delete().eq('id',id).eq('owner_id',ownerId));await load(true);msg('تم حذف السجل بنجاح')}catch(x){msg(x.message)}return}const rows=kind==='attendance'?attendance:payments,row=rows.find(x=>x.id===id);if(!row)return;try{let patch;if(kind==='attendance'){const date=prompt('تاريخ الحضور (YYYY-MM-DD):',row.session_date);if(date===null)return;const status=prompt('الحالة: حاضر أو غائب أو متأخر أو بعذر',row.status);if(status===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['حاضر','غائب','متأخر','بعذر'].includes(status.trim())){msg('راجع التاريخ والحالة');return}patch={session_date:date,status:status.trim()}}else{const amount=prompt('المبلغ:',String(row.amount));if(amount===null)return;const date=prompt('تاريخ الدفع (YYYY-MM-DD):',row.paid_at);if(date===null)return;const note=prompt('ملاحظة:',row.note||'');if(note===null)return;if(!Number.isFinite(Number(amount))||Number(amount)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)){msg('راجع المبلغ والتاريخ');return}patch={amount:Number(amount),paid_at:date,note:note.trim()}}const tableName=kind==='attendance'?'attendance':'payments';await run(db.from(tableName).update(patch).eq('id',id).eq('owner_id',ownerId));await load(true);msg('تم تعديل السجل بنجاح')}catch(x){msg(x.message)}});
async function backup(){try{if(role!=='owner')return;const payload={students,groups,attendance,payments,links,created_at:new Date().toISOString()};await run(db.from('backup_snapshots').insert({owner_id:session.user.id,payload,reason:'manual'}));const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.href=url;a.download='student-followup-backup-'+localDate()+'.json';a.click();URL.revokeObjectURL(url);msg('تم حفظ نسخة احتياطية في قاعدة البيانات وتنزيل نسخة على جهازك')}catch(e){msg(e.message)}}
