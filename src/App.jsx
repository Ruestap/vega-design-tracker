import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, query, where, addDoc, updateDoc, orderBy, writeBatch } from "firebase/firestore";

/* ══ SERVICIO NOTIFICACIONES IN-APP ═══════════════════════
   Colección: trade_notificaciones
   Schema: { id, destinatarioId, tipo, titulo, mensaje, reqId, leida, creadoEn }
   Tipos: "asignacion" | "aprobacion" | "rechazo" | "entregado" | "deadline"
════════════════════════════════════════════════════════ */
const NOTIF_COL = "trade_notificaciones";

async function crearNotif({destinatarioId,tipo,titulo,mensaje,reqId}){
  if(!destinatarioId) return;
  await addDoc(collection(db,NOTIF_COL),{
    destinatarioId,tipo,titulo,mensaje,reqId:reqId||null,
    leida:false,creadoEn:new Date().toISOString(),
  });
}
async function notifAsignacion({disId,disNombre,req}){
  await crearNotif({destinatarioId:disId,tipo:"asignacion",
    titulo:"Nuevo trabajo asignado",
    mensaje:"Se te asignó: \""+req.titulo+"\" · Deadline: "+(req.deadline||"sin fecha"),reqId:req.id});
}
async function notifListoParaRevision({adminId,req}){
  if(!adminId) return;
  await crearNotif({destinatarioId:adminId,tipo:"aprobacion",
    titulo:"Listo para revisión",
    mensaje:"\""+req.titulo+"\" está listo para que lo revises y apruebes.",reqId:req.id});
}
async function notifAprobado({disId,req}){
  await crearNotif({destinatarioId:disId,tipo:"entregado",
    titulo:"Entrega aprobada ✓",
    mensaje:"\""+req.titulo+"\" fue aprobado"+(req.aTiempo?" a tiempo":" (con retraso)")+".",reqId:req.id});
}
async function notifRechazo({disId,req,motivo}){
  await crearNotif({destinatarioId:disId,tipo:"rechazo",
    titulo:"Correcciones solicitadas",
    mensaje:"\""+req.titulo+"\": "+(motivo||"revisa las observaciones"),reqId:req.id});
}
async function marcarNotifLeida(id){
  await updateDoc(doc(db,NOTIF_COL,id),{leida:true});
}
async function marcarTodasLeidas(userId){
  const q=query(collection(db,NOTIF_COL),where("destinatarioId","==",userId),where("leida","==",false));
  const snap=await getDocs(q);
  const batch=writeBatch(db);
  snap.forEach(d=>batch.update(d.ref,{leida:true}));
  await batch.commit();
}

/* ══ CONSTANTES ══════════════════════════════════════════ */
const MESES_N = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_C  = ["D","L","M","X","J","V","S"];
const AV_COLORS = ["#6c5ce7","#00b894","#0984e3","#e17055","#f6a623","#a29bfe","#fd79a8","#00b5b4"];

const TIPOS_DEFAULT = [
  {id:"catalogo",  n:"Catálogo",           e:"📒", hEst:8,   activo:true},
  {id:"pop",       n:"Material POP",       e:"🎯", hEst:3,   activo:true},
  {id:"digital",   n:"Digital / RRSS",     e:"📱", hEst:2,   activo:true},
  {id:"volante",   n:"Volante / Afiche",   e:"📄", hEst:2.5, activo:true},
  {id:"marcador",  n:"Marcador Precio",    e:"🏷️", hEst:1.5, activo:true},
  {id:"gondola",   n:"Góndola / Exhibidor",e:"🏗️", hEst:4,   activo:true},
  {id:"creativo",  n:"Creativo (brief)",   e:"⭐", hEst:10,  activo:true},
];


const AREAS_DEFAULT = ["Trade Marketing","Comercial","Marketing","Operaciones","Gerencia","Otra"];
const TONOS     = ["Corporativo","Emocional","Promocional","Divertido","Impactante"];
const MATERIALES = [
  "Feed Instagram (1080×1080)","Historia Instagram (1080×1920)",
  "Banner WhatsApp","Banner Web","Pieza física (afiche/vinil)",
  "Diseño góndola/cabecera","Reel / Video","Otro",
];

const STAT_C = {
  pendiente:"#f6a623", en_diseno:"#6c5ce7", aprobacion:"#0984e3",
  entregado:"#00b894", retrasado:"#e17055", cancelado:"#b2bec3",
};
const STAT_L = {
  pendiente:"Pendiente", en_diseno:"En diseño",
  aprobacion:"En aprobación", entregado:"Entregado ✓",
  retrasado:"Retrasado ⚠", cancelado:"Cancelado",
};

const SESSION_KEY = "vega_trade_session";

/* ══ HOOK NOTIFICACIONES ════════════════════════════════ */
function useNotificaciones(userId){
  const [notifs,setNotifs]=useState([]);
  useEffect(()=>{
    if(!userId) return;
    const q=query(collection(db,NOTIF_COL),where("destinatarioId","==",userId),orderBy("creadoEn","desc"));
    const unsub=onSnapshot(q,snap=>{
      const arr=[];snap.forEach(d=>arr.push({id:d.id,...d.data()}));setNotifs(arr);
    });
    return()=>unsub();
  },[userId]);
  const noLeidas=notifs.filter(n=>!n.leida).length;
  const leerUna=useCallback(id=>marcarNotifLeida(id),[]);
  const leerTodas=useCallback(()=>marcarTodasLeidas(userId),[userId]);
  return{notifs,noLeidas,leerUna,leerTodas};
}
const NOTIF_ICON={asignacion:"📌",aprobacion:"👀",rechazo:"↩",entregado:"✅",deadline:"⚠️"};
function NotificacionesBell({uId,onVerReq}){
  const {notifs,noLeidas,leerUna,leerTodas}=useNotificaciones(uId);
  const [open,setOpen]=useState(false);
  const handleClick=n=>{leerUna(n.id);if(n.reqId&&onVerReq)onVerReq(n.reqId);setOpen(false);};
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{position:"relative",padding:"5px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.85)",cursor:"pointer",fontSize:16,lineHeight:1}}>
        🔔
        {noLeidas>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#e17055",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #1a2f4a"}}>{noLeidas>9?"9+":noLeidas}</span>}
      </button>
      {open&&<>
        <div style={{position:"fixed",inset:0,zIndex:48}} onClick={()=>setOpen(false)}/>
        <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:320,background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",boxShadow:"0 8px 30px rgba(0,0,0,.15)",zIndex:49,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #f0f4f8"}}>
            <span style={{fontWeight:700,fontSize:13,color:"#1a2f4a"}}>Notificaciones{noLeidas>0?" ("+noLeidas+")":""}</span>
            {noLeidas>0&&<button onClick={leerTodas} style={{fontSize:10,color:"#6c5ce7",border:"none",background:"none",cursor:"pointer",fontWeight:700}}>Marcar todas leidas</button>}
          </div>
          <div style={{maxHeight:340,overflowY:"auto"}}>
            {notifs.length===0?<div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12}}>Sin notificaciones</div>
              :notifs.slice(0,20).map(n=>(
                <div key={n.id} onClick={()=>handleClick(n)}
                  style={{display:"flex",gap:10,padding:"11px 16px",borderBottom:"1px solid #f5f7fa",cursor:n.reqId?"pointer":"default",background:n.leida?"#fff":"#f8f6ff"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0edff"}
                  onMouseLeave={e=>e.currentTarget.style.background=n.leida?"#fff":"#f8f6ff"}>
                  <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{NOTIF_ICON[n.tipo]||"🔔"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:n.leida?400:700,color:"#1a2f4a",marginBottom:2}}>{n.titulo}</div>
                    <div style={{fontSize:11,color:"#5a7a9a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.mensaje}</div>
                    <div style={{fontSize:9,color:"#b2bec3",marginTop:3}}>{new Date(n.creadoEn).toLocaleString("es-PE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  {!n.leida&&<div style={{width:8,height:8,borderRadius:"50%",background:"#6c5ce7",flexShrink:0,marginTop:5}}/>}
                </div>
              ))}
          </div>
        </div>
      </>}
    </div>
  );
}

/* ══ UTILS ══════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().slice(0,10);

function getAlerta(req) {
  const hoy = todayStr();
  const ahora = new Date();
  const stat = req.stat;
  const fe = req.fechaEntrega || req.deadline || "";
  const fi = req.fechaInicio || "";
  const hc = req.horaCorte || "";

  if(stat==="cancelado") return {label:"Finalizado",c:"#b2bec3",bg:"#f4f6f8"};
  if(stat==="entregado") return {label:"Finalizado",c:"#00b894",bg:"#e8faf5"};

  if(stat==="aprobacion") return {label:"En proceso",c:"#0984e3",bg:"#e8f4fd"};

  // Verificar si ya pasó la fecha+hora de corte
  if(fe) {
    if(hoy > fe) return {label:"Retraso "+calcDiasRetraso(fe)+"d",c:"#dc2626",bg:"#ffeae6"};
    if(hoy === fe) {
      if(hc) {
        const [hh,mm] = hc.split(":").map(Number);
        const corte = new Date(); corte.setHours(hh,mm,0,0);
        if(ahora > corte) return {label:"Retraso",c:"#dc2626",bg:"#ffeae6"};
        return {label:"Hoy · vence "+hc,c:"#e17055",bg:"#fff1ee"};
      }
      return {label:"Vence hoy",c:"#e17055",bg:"#fff1ee"};
    }
  }

  if(stat==="pendiente") {
    if(fi && hoy < fi) return {label:"Pendiente",c:"#f6a623",bg:"#fff8ec"};
    if(fe && hoy > fe) return {label:"Retraso "+calcDiasRetraso(fe)+"d",c:"#dc2626",bg:"#ffeae6"};
    return {label:"Pendiente",c:"#f6a623",bg:"#fff8ec"};
  }

  if(stat==="en_diseno") {
    if(fe && hoy > fe) return {label:"Retraso "+calcDiasRetraso(fe)+"d",c:"#dc2626",bg:"#ffeae6"};
    const dias = fe ? Math.ceil((new Date(fe)-new Date(hoy))/86400000) : null;
    if(dias!==null && dias<=2) return {label:"En proceso",c:"#6c5ce7",bg:"#f0edff"};
    return {label:"En proceso",c:"#6c5ce7",bg:"#f0edff"};
  }

  return {label:"—",c:"#b2bec3",bg:"#f4f6f8"};
}

function calcDiasRetraso(fechaStr) {
  if(!fechaStr) return 0;
  return Math.ceil((new Date(todayStr())-new Date(fechaStr))/86400000);
}

function getDisponibilidad(disId, solicitudes, fechaNueva, horaCorteNueva, disNombre) {
  const hoy = todayStr();
  const manana = new Date(); manana.setDate(manana.getDate()+1);
  const mananaStr = manana.toISOString().slice(0,10);

  const activas = solicitudes.filter(s =>
    (s.responableId === disId || (disNombre && s.responableNombre === disNombre)) &&
    ["en_diseno","aprobacion","pendiente"].includes(s.stat)
  );
  if(activas.length === 0) return {nivel:"libre", msg:"Disponible · sin tareas activas", activos:0, bloquear:false};

  // Ordenar por fecha de entrega más próxima
  const ordenadas = [...activas].sort((a,b)=>{
    const fa = a.fechaEntrega||"9999"; const fb = b.fechaEntrega||"9999";
    return fa.localeCompare(fb);
  });
  const proxima = ordenadas[0];
  const fechaProx = proxima.fechaEntrega || "";
  const horaProx = proxima.horaCorte || "18:30";
  const finProx = fechaProx ? new Date(fechaProx+"T"+horaProx+":00") : null;

  // REGLA 1: Tiene tarea venciendo hoy o mañana → OCUPADO, no asignable
  // salvo que la nueva tarea empiece DESPUÉS del cierre de la pendiente
  const venceHoyOManana = fechaProx === hoy || fechaProx === mananaStr;

  if(venceHoyOManana) {
    // Verificar si la nueva tarea puede empezar después del cierre
    if(fechaNueva && finProx) {
      const nuevaInicio = new Date(fechaNueva+"T"+(horaCorteNueva||"08:30")+":00");
      if(nuevaInicio > finProx) {
        // La nueva tarea comienza después del cierre → permitir pero advertir
        return {nivel:"ocupado", msg:"Libre desde "+fechaProx+" "+horaProx+" · cierra tarea actual primero", activos:activas.length, bloquear:false};
      }
    }
    return {nivel:"sobrecargado", msg:"Ocupado · entrega pendiente "+fechaProx+" a las "+horaProx+" · no asignable", activos:activas.length, bloquear:true};
  }

  // REGLA 2: Tiene 2+ activas → advertencia
  if(activas.length >= 2) {
    return {nivel:"ocupado", msg:"Sobrecargado · "+activas.length+" tareas activas · última entrega "+fechaProx, activos:activas.length, bloquear:false};
  }

  // REGLA 3: Tiene 1 activa con fecha futura → disponible con info
  // Pero si la nueva tarea se cruza con la pendiente → advertir
  if(fechaNueva && finProx) {
    const nuevaFin = new Date(fechaNueva+"T"+(horaCorteNueva||"18:30")+":00");
    if(nuevaFin <= finProx) {
      return {nivel:"ocupado", msg:"Conflicto · la nueva tarea vence antes que la pendiente ("+fechaProx+")", activos:activas.length, bloquear:false};
    }
  }

  return {nivel:"libre", msg:"Disponible · última entrega "+fechaProx, activos:activas.length, bloquear:false};
}

function calcHHManual(req) {
  // Calcula HH desde fechaInicio+horaInicio hasta fechaEntrega+horaCorte
  // L-V 08:30-18:30, Sab 08:30-11:30
  const fi = req.fechaInicio || req.creadoEn?.slice(0,10);
  const fe = req.fechaEntrega || req.deadline;
  const hi = req.horaInicio || "08:30";
  const hc = req.horaCorte || "18:30";
  if(!fi||!fe) return null;
  const inicio = new Date(fi+"T"+hi+":00");
  const fin = new Date(fe+"T"+hc+":00");
  if(fin<=inicio) return null;
  let hh=0, cur=new Date(inicio);
  while(cur<fin){
    const dow=cur.getDay();
    const nextDay=new Date(cur); nextDay.setHours(23,59,59,999);
    const dayEnd=nextDay<fin?nextDay:fin;
    if(dow>=1&&dow<=5){
      const s=new Date(cur); s.setHours(8,30,0,0);
      const e=new Date(cur); e.setHours(18,30,0,0);
      const from=Math.max(cur,s), to=Math.min(dayEnd,e);
      if(to>from) hh+=(to-from)/3600000;
    } else if(dow===6){
      const s=new Date(cur); s.setHours(8,30,0,0);
      const e=new Date(cur); e.setHours(11,30,0,0);
      const from=Math.max(cur,s), to=Math.min(dayEnd,e);
      if(to>from) hh+=(to-from)/3600000;
    }
    cur=new Date(cur); cur.setDate(cur.getDate()+1); cur.setHours(0,0,0,0);
  }
  return Math.round(hh*10)/10||null;
}

function calcTiempo(req) {
  const fi = req.fechaInicio || req.creadoEn?.slice(0,10);
  const fe = req.fechaEntrega || req.deadline;
  if(!fi||!fe) return {dias:0,total:0,pct:0,label:"—"};
  const inicio = new Date(fi);
  const fin = new Date(fe);
  const hoy = new Date(todayStr());
  const total = Math.max(1,Math.ceil((fin-inicio)/86400000));
  const transcurrido = Math.max(0,Math.min(total,Math.ceil((hoy-inicio)/86400000)));
  const pct = Math.round((transcurrido/total)*100);
  return {dias:transcurrido, total, pct, label:transcurrido+"/"+total};
}

const sc = v=>{ if(!v&&v!==0)return"#b2bec3"; if(v>=90)return"#00b894"; if(v>=70)return"#f6a623"; if(v>=50)return"#e17055"; return"#d63031"; };

function calcHH(inicio, fin) {
  if(!inicio||!fin) return 0;
  const t1=new Date(inicio), t2=new Date(fin);
  if(t2<=t1) return 0;
  let hh=0, cur=new Date(t1);
  while(cur<t2){
    const dow=cur.getDay();
    const nextDay=new Date(cur); nextDay.setHours(23,59,59,999);
    const dayEnd=nextDay<t2?nextDay:t2;
    if(dow>=1&&dow<=5){
      const ini=new Date(cur); ini.setHours(8,30,0,0);
      const fin2=new Date(cur); fin2.setHours(18,30,0,0);
      const s=Math.max(cur,ini), e=Math.min(dayEnd,fin2);
      if(e>s) hh+=(e-s)/3600000;
    } else if(dow===6){
      const ini=new Date(cur); ini.setHours(8,30,0,0);
      const fin2=new Date(cur); fin2.setHours(11,30,0,0);
      const s=Math.max(cur,ini), e=Math.min(dayEnd,fin2);
      if(e>s) hh+=(e-s)/3600000;
    }
    cur=new Date(cur); cur.setDate(cur.getDate()+1); cur.setHours(0,0,0,0);
  }
  return Math.round(hh*10)/10;
}

function getIniciales(nombre) {
  return nombre.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
}

function diasEnMes(y,m){ return new Date(y,m+1,0).getDate(); }

/* ══ NOTIFICACIONES WA + EMAIL ══════════════════════════ */
const AREAS_PRIORITARIAS = ["Trade Marketing","Marketing","Marketing Digital","Ecommerce","Servicio al Cliente"];

function abrirWA(telefono, mensaje) {
  if(!telefono) return;
  const tel = telefono.replace(/\D/g,"");
  const url = "https://wa.me/"+tel+"?text="+encodeURIComponent(mensaje);
  window.open(url,"_blank");
}

function abrirEmail(emails, asunto, cuerpo) {
  if(!emails||emails.length===0) return;
  const to = Array.isArray(emails)?emails.join(","):emails;
  // Convertir el link del app en HTML clickeable
  const cuerpoHtml = cuerpo
    .replace(/https:\/\/vega-design-tracker\.vercel\.app\?logout=1/g,
      "<a href=\"https://vega-design-tracker.vercel.app?logout=1\">Abrir VEGA Design Tracker</a>")
    .replace(/\n/g,"<br>");
  // Outlook 365 Web con body HTML
  const url = "https://outlook.office365.com/mail/deeplink/compose?to="+encodeURIComponent(to)+"&subject="+encodeURIComponent(asunto)+"&body="+encodeURIComponent(cuerpoHtml);
  const win = window.open(url,"_blank","noopener,noreferrer");
  if(!win){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.click();}
}

function buildMsgAsignacion(req, disNombre) {
  return "Hola "+disNombre+" 👋\n\nTienes una nueva actividad de diseño asignada:\n\n📋 *"+req.titulo+"*\n📅 Entrega: "+(req.fechaEntrega||"—")+"\n⏰ Hora de cierre: "+(req.horaCorte||"—")+"\n🏷 Tipo: "+(req.tipo||"—")+"\n📌 Área: "+(req.area||"—")+"\n\nRevisa el detalle en VEGA Design Tracker:\nhttps://vega-design-tracker.vercel.app?logout=1";
}

function buildMsgNuevaOtraArea(req, uName) {
  return "Nueva solicitud de diseño recibida de "+uName+":\n\n📋 "+req.titulo+"\n🏢 Área: "+(req.area||"—")+"\n🏷 Tipo: "+(req.tipo||"—")+"\n\nRequiere asignación de diseñador, fecha y hora de cierre.\n\nRevisa en VEGA Design Tracker:\nhttps://vega-design-tracker.vercel.app?logout=1";
}

function buildMsgRecordatorio(req, disNombre) {
  return "⚠️ Recordatorio - Entrega mañana\n\nHola "+disNombre+", tu actividad *"+req.titulo+"* vence mañana "+req.fechaEntrega+" a las "+(req.horaCorte||"18:30")+".\n\nVEGA Design Tracker:\nhttps://vega-design-tracker.vercel.app?logout=1";
}

/* ══ APP PRINCIPAL ══════════════════════════════════════ */
export default function TradeApp() {
  const now = new Date();

  /* ── auth ── */
  const [usuario, setUsuario] = useState(() => {
    try {
      if(window.location.search.includes("logout=1")){
        localStorage.removeItem(SESSION_KEY);
        window.history.replaceState({},"",window.location.pathname);
        return null;
      }
      const s=localStorage.getItem(SESSION_KEY); return s?JSON.parse(s):null;
    }
    catch { return null; }
  });
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (usuario) localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
    else         localStorage.removeItem(SESSION_KEY);
  }, [usuario]);

  /* ── nav ── */
  const [tab, setTab] = useState(0);
  const [panelNotif, setPanelNotif] = useState(null);

  /* ── data Firebase ── */
  const [solicitudes, setSolicitudes] = useState([]);
  const [tradeUsers,  setTradeUsers]  = useState([]);
  const [config, setConfig] = useState({
    tipos: TIPOS_DEFAULT,
    areas: AREAS_DEFAULT,
  });

  /* ── filtros ── */
  const [fStat,setFStat]=useState("Todos");
  const [fTipo,setFTipo]=useState("Todos");
  const [fResp,setFResp]=useState("Todos");
  const [busq,setBusq]=useState("");

  /* ── Gantt ── */
  const [gYear,setGYear]=useState(now.getFullYear());
  const [gMonth,setGMonth]=useState(now.getMonth());
  const [gFiltResp,setGFiltResp]=useState("");
  const [gFiltTipo,setGFiltTipo]=useState("");
  const [gFiltStat,setGFiltStat]=useState("");
  const [selReq,setSelReq]=useState(null);
  const [dashLvl,setDashLvl]=useState(1);

  /* ── brief / edición ── */
  const [briefModal,setBriefModal]=useState(false);
  const [briefEdit,setBriefEdit]=useState(null);
  const [brief,setBrief]=useState(emptyBrief());

  /* ── toast ── */
  const [toast,setToast]=useState("");
  const toastRef=useRef();

  /* ── cfg ── */
  const [cfgTab,setCfgTab]=useState(0);
  const [newTipo,setNewTipo]=useState({n:"",e:"📌",hEst:2});
  const [newDis,setNewDis]=useState({nombre:"",rol:"Diseñador",hSem:48});
  const [showNewT,setShowNewT]=useState(false);
  const [showNewD,setShowNewD]=useState(false);

  /* ── Firebase listeners ── */
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"trade_solicitudes"),snap=>{
      const arr=[];
      snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      arr.sort((a,b)=>new Date(b.creadoEn||0)-new Date(a.creadoEn||0));
      setSolicitudes(arr);
    });
    return()=>unsub();
  },[]);

  useEffect(()=>{
    const unsub=onSnapshot(doc(db,"trade_config","app"),snap=>{
      if(snap.exists()) setConfig(c=>({...c,...snap.data()}));
    });
    return()=>unsub();
  },[]);

  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"trade_users"),snap=>{
      const arr=[];
      snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      setTradeUsers(arr);
    });
    return()=>unsub();
  },[]);

  const saveConfig=useCallback(async(overrides={})=>{
    const {disenadores:_removed,...cfgBase}={...config,...overrides};
    await setDoc(doc(db,"trade_config","app"),{...cfgBase,updatedAt:new Date().toISOString()});
  },[config]);

  const showToast=msg=>{
    setToast(msg);
    if(toastRef.current)clearTimeout(toastRef.current);
    toastRef.current=setTimeout(()=>setToast(""),2500);
  };

  /* ── LOGIN con DNI por rol ── */
  const handleLogin=useCallback(async(dniInput, rolSolicitado)=>{
    setLoginError(""); setLoginLoading(true);
    try {
      const dni=dniInput.trim();
      if(!dni){setLoginError("Por favor ingresa tu DNI.");setLoginLoading(false);return;}

      /* Rol viewer: acceso directo sin DNI en DB (solo código configurado) */
      if(rolSolicitado==="viewer"){
        const q=query(collection(db,"trade_users"),where("dni","==",dni),where("rol","==","viewer"),where("activo","==",true));
        const snap=await getDocs(q);
        if(snap.empty){setLoginError("Código incorrecto o sin acceso.");setLoginLoading(false);return;}
        const d=snap.docs[0].data();
        setUsuario({id:snap.docs[0].id,nombre:d.nombre,rol:"viewer",iniciales:getIniciales(d.nombre)});
        setLoginLoading(false); return;
      }

      /* Admin: busca DNI en trade_users con rol admin */
      if(rolSolicitado==="admin"){
        const q=query(collection(db,"trade_users"),where("dni","==",dni),where("rol","==","admin"),where("activo","==",true));
        const snap=await getDocs(q);
        if(snap.empty){setLoginError("DNI no encontrado o sin acceso admin.");setLoginLoading(false);return;}
        const d=snap.docs[0].data();
        setUsuario({id:snap.docs[0].id,nombre:d.nombre,rol:"admin",iniciales:getIniciales(d.nombre)});
        setLoginLoading(false); return;
      }

      /* Team Diseño (disenador): busca DNI en trade_users con rol disenador */
      if(rolSolicitado==="disenador"){
        const q=query(collection(db,"trade_users"),where("dni","==",dni),where("rol","==","disenador"),where("activo","==",true));
        const snap=await getDocs(q);
        if(snap.empty){setLoginError("DNI no encontrado o sin acceso de diseñador.");setLoginLoading(false);return;}
        const d=snap.docs[0].data();
        setUsuario({id:snap.docs[0].id,nombre:d.nombre,rol:"disenador",iniciales:getIniciales(d.nombre)});
        setLoginLoading(false); return;
      }

    } catch(err){console.error(err);setLoginError("Error de conexión. Intenta de nuevo.");}
    setLoginLoading(false);
  },[]);

  const handleLogout=useCallback(()=>setUsuario(null),[]);

  function emptyBrief(){
    return{titulo:"",area:"Trade Marketing",solicitante:"",prioridad:"Normal",
      tipo:"",fechaInicio:"",horaInicio:"",fechaEntrega:"",horaCorte:"",hEst:"",objetivo:"",publico:"",mensaje:"",
      mecanica:"",materiales:[],medidas:"",tono:"",restricciones:"",
      comentarios:"",recursos:"",productosInvolucrados:"",
      responableId:"",responableNombre:"",notificarA:[]};
  }

  /* ── Guardar actividad ── */
  const guardarSolicitud=async()=>{
    if(!brief.titulo||!brief.tipo||(!isViewer&&!brief.fechaEntrega)){showToast("⚠ Completa título y tipo");return null;}
    const id=briefEdit||"ACT-"+Date.now();
    const now2=new Date().toISOString();
    const existing=solicitudes.find(s=>s.id===briefEdit);
    const data={
      ...brief,id,
      deadline:brief.fechaEntrega||"",
      fechaInicio:brief.fechaInicio||"",
      horaInicio:brief.horaInicio||"",
      fechaEntrega:brief.fechaEntrega||"",
      horaCorte:brief.horaCorte||"",
      stat:briefEdit?(existing?.stat||"pendiente"):"pendiente",
      tsAsignado:briefEdit?(existing?.tsAsignado||null):(brief.responableId?new Date().toISOString():null),
      creadoEn:briefEdit?(existing?.creadoEn||now2):now2,
      creadoPor:usuario?.nombre||"",
      updatedAt:now2,
      responableId:briefEdit?(existing?.responableId||null):(brief.responableId||null),
      responableNombre:briefEdit?(existing?.responableNombre||null):(brief.responableNombre||null),
      hReal:briefEdit?(existing?.hReal||0):0,

      tsListo:null,tsEntregado:null,
      obs:briefEdit?(existing?.obs||""):"",
    };
    await setDoc(doc(db,"trade_solicitudes",id),data);

    if(!briefEdit) {
      if(data.notificarA && data.notificarA.length>0) {
        // CASO VISOR: retornar datos de email para que el botón los abra directo
        const destinatarios = tradeUsers.filter(u=>data.notificarA.includes(u.id) && u.email);
        if(destinatarios.length>0) {
          const emails = destinatarios.map(u=>u.email);
          const asunto = "Nueva solicitud pendiente de asignación — "+data.titulo;
          const cuerpo = "Hola equipo Trade Marketing,\n\nSe recibió una nueva solicitud de diseño.\n\nÁrea: "+data.area+"\nTítulo: "+data.titulo+"\nTipo: "+(data.tipo||"—")+"\nSolicitante: "+(data.creadoPor||"—")+"\n\nIngresen al app para asignar diseñador, fecha y hora de cierre:\nhttps://vega-design-tracker.vercel.app?logout=1";
          return {tipo:"email", emails, asunto, cuerpo};
        }
      } else if(data.responableId) {
        // CASO ADMIN con diseñador asignado → panel notificación
        const dis = tradeUsers.find(u=>u.id===data.responableId);
        if(dis) {
          const msg = buildMsgAsignacion(data, dis.nombre);
          const asunto = "Nueva actividad asignada: "+data.titulo;
          const cuerpoEmail = "Hola "+dis.nombre+",\n\nSe te asignó una nueva actividad de diseño.\n\nTítulo: "+data.titulo+"\nEntrega: "+(data.fechaEntrega||"—")+" "+(data.horaCorte||"")+"\nÁrea: "+(data.area||"—")+"\n\nVer en: https://vega-design-tracker.vercel.app?logout=1";
          setPanelNotif({nombre:dis.nombre,telefono:dis.telefono||"",email:dis.email||"",msgWA:msg,asunto,cuerpoEmail,titulo:data.titulo,reqId:data.id});
        }
      }
    }

    showToast(briefEdit?"✏️ Actividad actualizada":"✅ Actividad creada");
    setBriefModal(false);setBriefEdit(null);setBrief(emptyBrief());
    return null;
  };

  /* ── Acciones de estado ── */
  const asignarDis=async(reqId,disId)=>{
    const req=solicitudes.find(s=>s.id===reqId);if(!req)return;
    const dis=tradeUsers.find(d=>d.id===disId)||{nombre:disId};
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req,responableId:disId,responableNombre:dis?.nombre||disId,
      stat:"pendiente",tsAsignado:null,updatedAt:new Date().toISOString(),
    });
    await notifAsignacion({disId,disNombre:dis?.nombre||disId,req:{...req,titulo:req.titulo}});
    // Notificar al diseñador por WA y email
    showToast("📌 Asignado a "+(dis?.nombre||disId));
    // Mostrar panel de notificación
    if(dis) {
      const msg = buildMsgAsignacion({...req}, dis.nombre);
      const asunto = "Nueva actividad asignada: "+req.titulo;
      const cuerpoEmail = "Hola "+dis.nombre+",\n\nSe te asignó una nueva actividad de diseño.\n\nTítulo: "+req.titulo+"\nEntrega: "+(req.fechaEntrega||req.deadline||"—")+" "+(req.horaCorte||"")+"\nÁrea: "+(req.area||"—")+"\n\nVer en: https://vega-design-tracker.vercel.app?logout=1";
      setPanelNotif({
        nombre: dis.nombre,
        telefono: dis.telefono||"",
        email: dis.email||"",
        msgWA: msg,
        asunto,
        cuerpoEmail,
        titulo: req.titulo,
        reqId: reqId,
      });
    }
  };

  const iniciarTrabajo=async(reqId)=>{
    const req=solicitudes.find(s=>s.id===reqId);if(!req)return;
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req,stat:"en_diseno",tsAsignado:new Date().toISOString(),updatedAt:new Date().toISOString(),
    });
    showToast("▶ Trabajo iniciado");
  };

  const marcarListo=async(reqId)=>{
    const req=solicitudes.find(s=>s.id===reqId);if(!req)return;
    const ts=new Date().toISOString();
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req,stat:"aprobacion",tsListo:ts,hReal:calcHH(req.tsAsignado,ts),updatedAt:ts,
    });
    // Notificar al admin (userId prueba-admin como fallback)
    await notifListoParaRevision({adminId:"prueba-admin",req:{...req,titulo:req.titulo}});
    showToast("🎨 Marcado como listo para revisión");
  };

  const aprobarEntrega=async(reqId)=>{
    const req=solicitudes.find(s=>s.id===reqId);if(!req)return;
    const ts=new Date().toISOString();
    const aT=todayStr()<=(req.fechaEntrega||req.deadline||"9999-12-31");
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req,stat:aT?"entregado":"retrasado",tsEntregado:ts,aTiempo:aT,updatedAt:ts,
    });
    if(req.responableId) await notifAprobado({disId:req.responableId,req:{...req,aTiempo:aT}});
    showToast(aT?"✅ Entregado a tiempo 🎉":"⚠️ Entregado con retraso");
  };

  const rechazarEntrega=async(reqId,motivo)=>{
    const req=solicitudes.find(s=>s.id===reqId);if(!req)return;
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req,stat:"en_diseno",tsListo:null,
      obs:(req.obs||"")+(motivo?"\n[RECHAZADO: "+motivo+"]":""),updatedAt:new Date().toISOString(),
    });
    if(req.responableId) await notifRechazo({disId:req.responableId,req,motivo});
    showToast("↩ Enviado de vuelta a diseño");
  };

  const eliminarSolicitud=async(reqId)=>{
    await deleteDoc(doc(db,"trade_solicitudes",reqId));
    showToast("🗑️ Actividad eliminada");
  };

  const editarActividad=(req)=>{
    setBriefEdit(req.id);
    setBrief({
      titulo:req.titulo||"",area:req.area||"Trade Marketing",
      solicitante:req.solicitante||"",prioridad:req.prioridad||"Normal",
      tipo:req.tipo||"",fechaInicio:req.fechaInicio||"",horaInicio:req.horaInicio||"",fechaEntrega:req.fechaEntrega||"",horaCorte:req.horaCorte||"",hEst:req.hEst||"",
      objetivo:req.objetivo||"",publico:req.publico||"",mensaje:req.mensaje||"",
      mecanica:req.mecanica||"",materiales:req.materiales||[],
      medidas:req.medidas||"",tono:req.tono||"",restricciones:req.restricciones||"",
      comentarios:req.comentarios||"",recursos:req.recursos||"",
      productosInvolucrados:req.productosInvolucrados||"",
    });
    setBriefModal(true);
  };

  /* ── Helper: resolver responsable desde trade_users ── */
  const resolverResp = useCallback((responableId, responableNombre)=>{
    if(!responableId && !responableNombre) return null;
    const u = tradeUsers.find(u=>u.id===responableId || u.nombre===responableNombre);
    if(u) return {id:u.id, nombre:u.nombre, iniciales:getIniciales(u.nombre), color:u.color||"#6c5ce7", email:u.email||"", telefono:u.telefono||""};
    if(responableNombre) return {id:responableId||"", nombre:responableNombre, iniciales:getIniciales(responableNombre), color:"#6c5ce7", email:"", telefono:""};
    return null;
  },[tradeUsers]);

  /* ── Computed ── */
  const role=usuario?.rol||null;
  const uName=usuario?.nombre||"";
  const isAdmin=role==="admin";
  const isDisenador=role==="disenador";
  const isViewer=role==="viewer";
  const canCreate=role==="admin";

  const solFilt=useMemo(()=>solicitudes.filter(s=>{
    if(fStat!=="Todos"&&s.stat!==fStat)return false;
    if(fTipo!=="Todos"&&s.tipo!==fTipo)return false;
    if(fResp!=="Todos"&&s.responableId!==fResp)return false;
    if(busq&&!s.titulo.toLowerCase().includes(busq.toLowerCase()))return false;
    if(isDisenador&&s.responableNombre!==uName)return false;
    return true;
  }),[solicitudes,fStat,fTipo,fResp,busq,isDisenador,uName]);

  const kpis=useMemo(()=>{
    const src=isDisenador?solicitudes.filter(s=>s.responableNombre===uName):solicitudes;
    const total=src.length;
    const ok=src.filter(s=>s.stat==="entregado").length;
    const delay=src.filter(s=>s.stat==="retrasado").length;
    const active=src.filter(s=>["en_diseno","aprobacion"].includes(s.stat)).length;
    const pend=src.filter(s=>s.stat==="pendiente").length;
    const efic=total>0?Math.round((ok/(ok+delay||1))*100):0;
    const hTotEst=src.reduce((a,s)=>a+(parseFloat(s.hEst)||0),0);
    const hTotReal=src.reduce((a,s)=>a+(s.hReal||0),0);
    return{total,ok,delay,active,pend,efic,hTotEst:Math.round(hTotEst*10)/10,hTotReal:Math.round(hTotReal*10)/10};
  },[solicitudes,isDisenador,uName]);

  /* ── ESTILOS BASE ── */
  const S={
    wrap:{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f0f4f8",minHeight:"100vh",color:"#1a2f4a",width:"100%",boxSizing:"border-box"},
    card:{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",boxShadow:"0 2px 8px rgba(0,0,0,.05)"},
    inp:{width:"100%",padding:"10px 13px",borderRadius:10,border:"1px solid #c8d8e8",background:"#f8fafc",color:"#1a2f4a",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
    lbl:{fontSize:10,fontWeight:700,color:"#5a7a9a",letterSpacing:".05em",display:"block",marginBottom:5},
    pill:(c,bg)=>({padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:bg,display:"inline-flex",alignItems:"center"}),
    tabB:(on,c="#00b5b4")=>({padding:"9px 16px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,borderBottom:on?"3px solid "+c:"3px solid transparent",color:on?c:"#8aaabb",background:"transparent",whiteSpace:"nowrap"}),
    btn:(c)=>({padding:"11px 18px",borderRadius:11,border:"none",background:"linear-gradient(135deg,"+c+",#1a2f4a)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}),
    btnO:(c)=>({padding:"8px 14px",borderRadius:9,border:"1.5px solid "+c,background:c+"18",color:c,fontSize:12,fontWeight:700,cursor:"pointer"}),
  };

  if(!usuario) return <LoginScreen onLogin={handleLogin} loginError={loginError} loginLoading={loginLoading}/>;

  const tabsConfig=isAdmin
    ?[{i:0,label:"📋 Actividades"},{i:1,label:"📝 Nueva actividad"},{i:2,label:"🎨 Kanban"},{i:3,label:"📊 Dashboard"},{i:4,label:"⚙️ Config"}]
    :isDisenador
    ?[{i:0,label:"📋 Mis trabajos"},{i:2,label:"🎨 Kanban"},{i:3,label:"📊 Dashboard"}]
    :isViewer
    ?[{i:1,label:"📝 Nueva solicitud"},{i:3,label:"📊 Dashboard"}]
    :[{i:3,label:"📊 Dashboard"}];

  return(
    <div style={S.wrap}>
<div style={{background:"#1a2f4a",padding:"11px 24px 0",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4A5568,#2D3748)",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,.2)"}}>
              <svg width="24" height="24" viewBox="0 0 52 52" fill="none">
                <rect x="2" y="2" width="22" height="22" rx="3" fill="#FF6B6B"/>
                <text x="13" y="18" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Arial">Id</text>
                <rect x="28" y="2" width="22" height="22" rx="3" fill="#F4A261"/>
                <text x="39" y="18" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Arial">Ai</text>
                <rect x="15" y="28" width="22" height="22" rx="3" fill="#4FC3F7"/>
                <text x="26" y="44" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Arial">Ps</text>
              </svg>
            </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#fff"}}>VEGA · DESIGN TRACKER</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",letterSpacing:".06em"}}>GESTIÓN DE DISEÑO Y PRODUCCIÓN</div>
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>

            <NotificacionesBell uId={usuario?.id||""} onVerReq={()=>setTab(0)}/>
            <div style={{padding:"4px 10px",borderRadius:20,background:"rgba(108,92,231,.25)",border:"1px solid rgba(108,92,231,.4)",fontSize:9,color:"#a29bfe",fontWeight:700}}>
              {role==="admin"?"🪪":role==="disenador"?"🎨":"👁️"} {uName}
            </div>
            <button onClick={handleLogout} style={{padding:"5px 9px",borderRadius:7,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.08)",color:"#5a7a9a",cursor:"pointer",fontSize:10,fontWeight:700}} title="Cerrar sesión">↩</button>
          </div>
        </div>
        <div style={{display:"flex",gap:0,overflowX:"auto"}}>
          {tabsConfig.map(t=>(
            <button key={t.i} onClick={()=>setTab(t.i)} style={S.tabB(tab===t.i,"#a29bfe")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 24px",maxWidth:"100%",boxSizing:"border-box"}}>
        {tab===0&&<TabActividades S={S} solicitudes={solFilt} kpis={kpis} config={config} fStat={fStat} setFStat={setFStat} fTipo={fTipo} setFTipo={setFTipo} fResp={fResp} setFResp={setFResp} busq={busq} setBusq={setBusq} isAdmin={isAdmin} isDisenador={isDisenador} asignarDis={asignarDis} aprobarEntrega={aprobarEntrega} rechazarEntrega={rechazarEntrega} eliminarSolicitud={eliminarSolicitud} editarActividad={editarActividad} showToast={showToast} uName={uName} resolverResp={resolverResp} tradeUsers={tradeUsers} iniciarTrabajo={iniciarTrabajo}/>}
        {tab===1&&(isAdmin||isViewer)&&<TabBrief S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} isAdmin={isAdmin} isViewer={isViewer} editMode={!!briefEdit} onCancel={()=>{setBriefEdit(null);setBrief(emptyBrief());setTab(0);}} solicitudes={solicitudes}/>}
        {tab===2&&<TabKanban S={S} solicitudes={isDisenador?solicitudes.filter(s=>s.responableNombre===uName):solicitudes} config={config} isAdmin={isAdmin} isDisenador={isDisenador} asignarDis={asignarDis} marcarListo={marcarListo} iniciarTrabajo={iniciarTrabajo} aprobarEntrega={aprobarEntrega} rechazarEntrega={rechazarEntrega} uName={uName} showToast={showToast} resolverResp={resolverResp} tradeUsers={tradeUsers}/>}
        {tab===3&&<TabDashboard S={S} solicitudes={isDisenador?solicitudes.filter(s=>s.responableNombre===uName):solicitudes} config={config} kpis={kpis} dashLvl={dashLvl} setDashLvl={setDashLvl} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} isDisenador={isDisenador} tradeUsers={tradeUsers}/>}
        {tab===4&&isAdmin&&<TabConfig S={S} config={config} setConfig={setConfig} saveConfig={saveConfig} cfgTab={cfgTab} setCfgTab={setCfgTab} newTipo={newTipo} setNewTipo={setNewTipo} newDis={newDis} setNewDis={setNewDis} showNewT={showNewT} setShowNewT={setShowNewT} showNewD={showNewD} setShowNewD={setShowNewD} showToast={showToast}/>}
      </div>

      {briefModal&&<BriefModal S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} onClose={()=>{setBriefModal(false);setBriefEdit(null);setBrief(emptyBrief());}} isAdmin={isAdmin} editMode={!!briefEdit} solicitudes={solicitudes}/>}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a2f4a",color:"#fff",padding:"11px 22px",borderRadius:24,fontSize:13,fontWeight:700,zIndex:99,boxShadow:"0 6px 24px rgba(0,0,0,.25)",whiteSpace:"nowrap"}}>{toast}</div>}

      {panelNotif&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:60,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:24,width:"90%",maxWidth:420}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{getIniciales(panelNotif.nombre)}</div>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Notificar a {panelNotif.nombre}</div>
                <div style={{fontSize:11,color:"#8aaabb"}}>📋 {panelNotif.titulo}</div>
              </div>
            </div>
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:12,fontSize:11,color:"#1a2f4a",marginBottom:14,whiteSpace:"pre-wrap",maxHeight:110,overflow:"auto",lineHeight:1.6}}>{panelNotif.msgWA}</div>
            <div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",letterSpacing:".05em",marginBottom:8}}>SELECCIONA EL CANAL</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
              {panelNotif.telefono&&!panelNotif.esOtraArea&&(
                <button onClick={async()=>{abrirWA(panelNotif.telefono,panelNotif.msgWA);if(panelNotif.reqId)await setDoc(doc(db,"trade_solicitudes",panelNotif.reqId),{...solicitudes.find(s=>s.id===panelNotif.reqId),tsNotificado:new Date().toISOString()},{merge:true});}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderRadius:11,border:"1.5px solid #00b894",background:"#e8faf5",color:"#085041",cursor:"pointer",fontWeight:700,fontSize:12,textAlign:"left"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#00b894" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  <div><div style={{fontWeight:700}}>WA directo a {panelNotif.nombre}</div><div style={{fontSize:10,fontWeight:400,color:"#0F6E56",marginTop:1}}>Abre WhatsApp con mensaje listo</div></div>
                </button>
              )}
              {!panelNotif.esOtraArea&&<button onClick={async()=>{abrirWA("",panelNotif.msgWA);if(panelNotif.reqId)await setDoc(doc(db,"trade_solicitudes",panelNotif.reqId),{...solicitudes.find(s=>s.id===panelNotif.reqId),tsNotificado:new Date().toISOString()},{merge:true});}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderRadius:11,border:"1.5px solid #25D366",background:"#f0fff8",color:"#128C7E",cursor:"pointer",fontWeight:700,fontSize:12,textAlign:"left"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                <div><div style={{fontWeight:700}}>Grupo CARTELERÍA</div><div style={{fontSize:10,fontWeight:400,color:"#085041",marginTop:1}}>Reenvía desde tu WhatsApp al grupo</div></div>
              </button>}
              {panelNotif.email&&(
                <button onClick={async()=>{abrirEmail([panelNotif.email],panelNotif.asunto,panelNotif.cuerpoEmail);if(panelNotif.reqId)await setDoc(doc(db,"trade_solicitudes",panelNotif.reqId),{...solicitudes.find(s=>s.id===panelNotif.reqId),tsNotificado:new Date().toISOString()},{merge:true});}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderRadius:11,border:"1.5px solid #0984e3",background:"#e8f4fd",color:"#0c447c",cursor:"pointer",fontWeight:700,fontSize:12,textAlign:"left"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0984e3" strokeWidth="2" style={{flexShrink:0}}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
                  <div><div style={{fontWeight:700}}>Email a {panelNotif.nombre}</div><div style={{fontSize:10,fontWeight:400,color:"#185FA5",marginTop:1}}>Abre Outlook 365 en el browser</div></div>
                </button>
              )}
            </div>
            <button onClick={()=>setPanelNotif(null)}
              style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:13}}>
              Listo — cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ LOGIN — rediseñado con selección de rol + DNI ════════ */
function LoginScreen({onLogin,loginError,loginLoading}){
  const [step,setStep]=useState("roles");   // "roles" | "disenador" | "admin" | "viewer"
  const [dni,setDni]=useState("");
  const [showDni,setShowDni]=useState(false);

  const inpS={width:"100%",padding:"13px 14px",borderRadius:12,background:"#f8fafc",border:"1.5px solid #c8d8e8",color:"#1a2f4a",fontSize:16,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',system-ui,sans-serif",transition:"border-color .2s",letterSpacing:2};

  const PASOS={
    disenador:{
      icon:"🎨", titulo:"Team Diseño",
      sub:"Ingresa tu DNI para acceder a tus trabajos",
      placeholder:"Tu número de DNI",
      color:"#6c5ce7", colorLight:"rgba(108,92,231,.2)",
      btnLabel:"Entrar al equipo →",
    },
    admin:{
      icon:"👑", titulo:"Administrador",
      sub:"Ingresa tu DNI de administrador",
      placeholder:"DNI del administrador",
      color:"#f6a623", colorLight:"rgba(246,166,35,.2)",
      btnLabel:"Acceder →",
    },
    viewer:{
      icon:"👁️", titulo:"Visor Gerencial",
      sub:"Ingresa el código de acceso gerencial",
      placeholder:"Código de acceso",
      color:"#0984e3", colorLight:"rgba(9,132,227,.2)",
      btnLabel:"Ver dashboard →",
    },
  };

  const handleSubmit=e=>{
    e.preventDefault();
    onLogin(dni,step);
  };

  return(
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"linear-gradient(160deg,#f0f4f8 0%,#e8eef5 60%,#dce6f0 100%)",minHeight:"100vh",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",boxSizing:"border-box"}}>
<div style={{width:"100%",maxWidth:460,background:"#fff",border:"1px solid #e2e8f0",borderRadius:22,padding:"40px 36px",boxSizing:"border-box",boxShadow:"0 8px 32px rgba(0,0,0,.08)"}}>

        {/* Logo */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:28,textAlign:"center"}}>
          <div style={{width:72,height:72,borderRadius:18,background:"linear-gradient(135deg,#4A5568,#2D3748)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"1px solid rgba(255,255,255,.2)",overflow:"hidden"}}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <rect x="2" y="2" width="22" height="22" rx="3" fill="#FF6B6B"/>
              <text x="13" y="18" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">Id</text>
              <rect x="28" y="2" width="22" height="22" rx="3" fill="#F4A261"/>
              <text x="39" y="18" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">Ai</text>
              <rect x="15" y="28" width="22" height="22" rx="3" fill="#4FC3F7"/>
              <text x="26" y="44" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">Ps</text>
            </svg>
          </div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#1a2f4a",letterSpacing:".04em"}}>VEGA · DESIGN TRACKER</div>
            <div style={{fontSize:10,color:"#5a7a9a",letterSpacing:".08em",marginTop:3}}>GESTIÓN DE DISEÑO Y PRODUCCIÓN</div>
          </div>
        </div>

        {/* PASO 1 — Selección de rol */}
        {step==="roles"&&(
          <>
            <div style={{color:"#5a7a9a",fontSize:13,textAlign:"center",marginBottom:20}}>Selecciona tu tipo de acceso</div>

            {/* Team Diseño */}
            <button onClick={()=>{setStep("disenador");setDni("");}}
              style={{width:"100%",padding:"16px 18px",borderRadius:14,border:"1.5px solid #c8d8e8",background:"#f8fafc",color:"#1a2f4a",cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",gap:14,textAlign:"left",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#f0edff";e.currentTarget.style.borderColor="#6c5ce7";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#c8d8e8";}}>
              <div style={{width:56,height:56,borderRadius:14,background:"#F0F4F8",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
                  <circle cx="50" cy="50" r="36" fill="none" stroke="#E0E0E0" strokeWidth="20"/>
                  <path d="M50 14 A36 36 0 0 1 86 50" fill="none" stroke="#81C784" strokeWidth="20"/>
                  <path d="M86 50 A36 36 0 0 1 68 82" fill="none" stroke="#FFB74D" strokeWidth="20"/>
                  <path d="M68 82 A36 36 0 0 1 32 82" fill="none" stroke="#F06292" strokeWidth="20"/>
                  <path d="M32 82 A36 36 0 0 1 14 50" fill="none" stroke="#64B5F6" strokeWidth="20"/>
                  <path d="M14 50 A36 36 0 0 1 50 14" fill="none" stroke="#AED581" strokeWidth="20"/>
                  <circle cx="50" cy="50" r="18" fill="white"/>
                  <line x1="30" y1="75" x2="62" y2="30" stroke="#1565C0" strokeWidth="6" strokeLinecap="round"/>
                  <polygon points="62,22 70,38 54,38" fill="#1565C0"/>
                  <polygon points="26,80 32,70 36,78" fill="#FFC107"/>
                  <circle cx="28" cy="82" r="4" fill="#FF8F00"/>
                </svg>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:"#6c5ce7"}}>Team Diseño</div>
                <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>Ingreso con mi DNI</div>
              </div>
            </button>

            {/* Administrador */}
            <button onClick={()=>{setStep("admin");setDni("");}}
              style={{width:"100%",padding:"16px 18px",borderRadius:14,border:"1.5px solid #c8d8e8",background:"#f8fafc",color:"#1a2f4a",cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",gap:14,textAlign:"left",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#fff8ec";e.currentTarget.style.borderColor="#f6a623";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#c8d8e8";}}>
              <div style={{width:56,height:56,borderRadius:14,background:"#E8F4FB",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg viewBox="0 0 110 100" xmlns="http://www.w3.org/2000/svg" width="50" height="44">
                  <rect x="2" y="8" width="82" height="72" rx="6" fill="#E3F2F9"/>
                  <rect x="2" y="8" width="40" height="72" rx="0" fill="#CFE9F5"/>
                  <rect x="2" y="8" width="82" height="72" rx="6" fill="none" stroke="#B8D4E8" strokeWidth="2"/>
                  <rect x="37" y="4" width="10" height="14" rx="3" fill="#FFC107"/>
                  <rect x="39" y="2" width="6" height="8" rx="2" fill="#FFB300"/>
                  <circle cx="22" cy="36" r="11" fill="#F4A896"/>
                  <path d="M8 70 Q8 52 22 52 Q36 52 36 70" fill="#7C6BC0"/>
                  <rect x="48" y="28" width="28" height="6" rx="3" fill="#6B5EA8"/>
                  <rect x="48" y="42" width="22" height="6" rx="3" fill="#6B5EA8"/>
                  <rect x="48" y="56" width="25" height="6" rx="3" fill="#6B5EA8"/>
                  <circle cx="88" cy="76" r="20" fill="url(#cg)"/>
                  <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#66BB6A"/><stop offset="100%" stopColor="#26A69A"/></linearGradient></defs>
                  <polyline points="78,76 85,84 100,66" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:"#e67e22"}}>Administrador</div>
                <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>Ingreso con mi DNI</div>
              </div>
            </button>

            {/* Visor Gerencial */}
            <button onClick={()=>{setStep("viewer");setDni("");}}
              style={{width:"100%",padding:"16px 18px",borderRadius:14,border:"1.5px solid #c8d8e8",background:"#f8fafc",color:"#1a2f4a",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#e8f4fd";e.currentTarget.style.borderColor="#0984e3";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#c8d8e8";}}>
              <div style={{width:56,height:56,borderRadius:14,background:"#E8ECF0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="44" height="44">
                  <rect x="6" y="8" width="88" height="64" rx="8" fill="#3F51B5"/>
                  <rect x="12" y="14" width="76" height="52" rx="4" fill="#64B5F6"/>
                  <rect x="12" y="14" width="38" height="52" rx="0" fill="#81D4FA"/>
                  <circle cx="34" cy="40" r="14" fill="none" stroke="#37474F" strokeWidth="5"/>
                  <circle cx="34" cy="40" r="8" fill="#E3F2FD"/>
                  <circle cx="66" cy="40" r="14" fill="none" stroke="#455A64" strokeWidth="5"/>
                  <circle cx="66" cy="40" r="8" fill="#E8EAF6"/>
                  <rect x="47" y="38" width="6" height="4" rx="2" fill="#37474F"/>
                  <rect x="6" y="37" width="10" height="5" rx="2.5" fill="#37474F"/>
                  <rect x="84" y="37" width="10" height="5" rx="2.5" fill="#455A64"/>
                  <rect x="36" y="72" width="28" height="8" rx="3" fill="#90A4AE"/>
                  <rect x="28" y="78" width="44" height="8" rx="4" fill="#B0BEC5"/>
                </svg>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:"#0984e3"}}>Visor Gerencial</div>
                <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>Código de acceso</div>
              </div>
            </button>
          </>
        )}

        {/* PASO 2 — Ingreso de DNI/código */}
        {step!=="roles"&&(()=>{
          const p=PASOS[step];
          return(
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
                <button onClick={()=>{setStep("roles");setDni("");}}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>← Volver</button>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,color:"#1a2f4a",fontWeight:700,fontSize:15}}>
                  {step==="disenador"&&<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="50" cy="50" r="36" fill="none" stroke="#E0E0E0" strokeWidth="20"/><path d="M50 14 A36 36 0 0 1 86 50" fill="none" stroke="#81C784" strokeWidth="20"/><path d="M86 50 A36 36 0 0 1 68 82" fill="none" stroke="#FFB74D" strokeWidth="20"/><path d="M68 82 A36 36 0 0 1 32 82" fill="none" stroke="#F06292" strokeWidth="20"/><path d="M32 82 A36 36 0 0 1 14 50" fill="none" stroke="#64B5F6" strokeWidth="20"/><path d="M14 50 A36 36 0 0 1 50 14" fill="none" stroke="#AED581" strokeWidth="20"/><circle cx="50" cy="50" r="18" fill="white"/><line x1="30" y1="75" x2="62" y2="30" stroke="#1565C0" strokeWidth="6" strokeLinecap="round"/><polygon points="62,22 70,38 54,38" fill="#1565C0"/><polygon points="26,80 32,70 36,78" fill="#FFC107"/></svg>}
                  {step==="admin"&&<svg viewBox="0 0 110 100" xmlns="http://www.w3.org/2000/svg" width="22" height="20"><rect x="2" y="8" width="82" height="72" rx="6" fill="#E3F2F9"/><rect x="2" y="8" width="40" height="72" rx="0" fill="#CFE9F5"/><rect x="37" y="4" width="10" height="14" rx="3" fill="#FFC107"/><circle cx="22" cy="36" r="11" fill="#F4A896"/><path d="M8 70 Q8 52 22 52 Q36 52 36 70" fill="#7C6BC0"/><rect x="48" y="28" width="28" height="6" rx="3" fill="#6B5EA8"/><rect x="48" y="42" width="22" height="6" rx="3" fill="#6B5EA8"/><circle cx="88" cy="76" r="20" fill="url(#cg2)"/><defs><linearGradient id="cg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#66BB6A"/><stop offset="100%" stopColor="#26A69A"/></linearGradient></defs><polyline points="78,76 85,84 100,66" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {step==="viewer"&&<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="6" y="8" width="88" height="64" rx="8" fill="#3F51B5"/><rect x="12" y="14" width="76" height="52" rx="4" fill="#64B5F6"/><rect x="12" y="14" width="38" height="52" rx="0" fill="#81D4FA"/><circle cx="34" cy="40" r="14" fill="none" stroke="#37474F" strokeWidth="5"/><circle cx="34" cy="40" r="8" fill="#E3F2FD"/><circle cx="66" cy="40" r="14" fill="none" stroke="#455A64" strokeWidth="5"/><circle cx="66" cy="40" r="8" fill="#E8EAF6"/><rect x="47" y="38" width="6" height="4" rx="2" fill="#37474F"/><rect x="36" y="72" width="28" height="8" rx="3" fill="#90A4AE"/><rect x="28" y="78" width="44" height="8" rx="4" fill="#B0BEC5"/></svg>}
                  {p.titulo}
                </div>
                  <div style={{color:"#5a7a9a",fontSize:11}}>{p.sub}</div>
                </div>
              </div>

              {loginError&&<div style={{background:"rgba(231,76,60,.15)",border:"1px solid rgba(231,76,60,.3)",borderRadius:10,padding:"10px 14px",color:"#ff7675",fontSize:12,marginBottom:16}}>⚠ {loginError}</div>}

              <form onSubmit={handleSubmit}>
                <label style={{display:"block",color:"#5a7a9a",fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>
                  {step==="viewer"?"Código de acceso":"Número de DNI"}
                </label>
                <div style={{position:"relative",marginBottom:22}}>
                  <input
                    autoFocus
                    type={showDni?"text":"password"}
                    placeholder={p.placeholder}
                    value={dni}
                    onChange={e=>setDni(e.target.value)}
                    style={{...inpS,border:"1.5px solid "+(loginError?"rgba(231,76,60,.6)":p.colorLight)}}
                    onFocus={e=>e.target.style.borderColor=p.color}
                    onBlur={e=>e.target.style.borderColor=loginError?"rgba(231,76,60,.6)":p.colorLight}
                  />
                  <button type="button" onClick={()=>setShowDni(v=>!v)}
                    style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#8aaabb",fontSize:16,padding:0,lineHeight:1}}>
                    <svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {showDni
        ?<g><rect x="20" y="45" width="60" height="42" rx="8" fill="#4A90D9"/><path d="M32 45V32C32 18 68 18 68 32V45" fill="none" stroke="#2C5F8A" strokeWidth="7" strokeLinecap="round"/><rect x="40" y="58" width="20" height="20" rx="4" fill="#2ECC71"/><polyline points="44,68 48,74 56,62" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></g>
        :<g><rect x="20" y="45" width="60" height="42" rx="8" fill="#F39C12"/><path d="M32 45V32C32 18 68 18 68 32V45" fill="none" stroke="#E67E22" strokeWidth="7" strokeLinecap="round" strokeDasharray="8 4"/><line x1="36" y1="58" x2="64" y2="80" stroke="#E74C3C" strokeWidth="6" strokeLinecap="round"/><line x1="64" y1="58" x2="36" y2="80" stroke="#E74C3C" strokeWidth="6" strokeLinecap="round"/></g>
      }
    </svg>
                  </button>
                </div>
                <button type="submit" disabled={loginLoading||!dni.trim()}
                  style={{width:"100%",padding:"13px",borderRadius:12,border:"none",
                    background:dni.trim()?"linear-gradient(135deg,"+p.color+","+p.color+"99)":"rgba(255,255,255,.1)",
                    color:dni.trim()?"#fff":"rgba(255,255,255,.3)",
                    fontSize:14,fontWeight:700,cursor:dni.trim()&&!loginLoading?"pointer":"not-allowed",opacity:loginLoading?.7:1}}>
                  {loginLoading?"Verificando...":p.btnLabel}
                </button>
              </form>

              <div style={{color:"#8aaabb",fontSize:11,textAlign:"center",marginTop:18}}>
                ¿Problemas para ingresar? Contacta al administrador.
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ══ TAB ACTIVIDADES ════════════════════════════════════ */
function TabActividades({S,solicitudes,kpis,config,fStat,setFStat,fTipo,setFTipo,fResp,setFResp,busq,setBusq,isAdmin,isDisenador,asignarDis,aprobarEntrega,rechazarEntrega,eliminarSolicitud,editarActividad,showToast,uName,resolverResp,tradeUsers,iniciarTrabajo}){
  const [assignModal,setAssignModal]=useState(null);
  const [rejectModal,setRejectModal]=useState(null);
  const [rejectMotivo,setRejectMotivo]=useState("");
  const [delModal,setDelModal]=useState(null);
  const [verBrief,setVerBrief]=useState(null);
  const tipos=config.tipos||[];
  const dis=(tradeUsers||[]).filter(u=>u.rol==="disenador"&&u.activo!==false);

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total",val:kpis.total,c:"#6c5ce7",icon:"📋"},
          {label:"Entregadas",val:kpis.ok,c:"#00b894",icon:"✅"},
          {label:"En proceso",val:kpis.active,c:"#0984e3",icon:"🎨"},
          {label:"Pendientes",val:kpis.pend,c:"#f6a623",icon:"⏳"},
          {label:"Retrasadas",val:kpis.delay,c:"#e17055",icon:"⚠️"},
        ].map(k=>(
          <div key={k.label} style={{...S.card,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <span style={{fontSize:18}}>{k.icon}</span>
              <span style={{fontSize:8,color:"#b2bec3",fontWeight:700}}>{k.label.toUpperCase()}</span>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:k.c,lineHeight:1,marginTop:6}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span>
          <input placeholder="Buscar actividad..." value={busq} onChange={e=>setBusq(e.target.value)} style={{...S.inp,paddingLeft:32,maxWidth:200,fontSize:12}}/>
        </div>
        <select value={fStat} onChange={e=>setFStat(e.target.value)} style={{...S.inp,width:"auto",padding:"8px 11px",fontSize:12}}>
          <option value="Todos">Todos los estados</option>
          {Object.entries(STAT_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fTipo} onChange={e=>setFTipo(e.target.value)} style={{...S.inp,width:"auto",padding:"8px 11px",fontSize:12}}>
          <option value="Todos">Todos los tipos</option>
          {tipos.map(t=><option key={t.id} value={t.id}>{t.e} {t.n}</option>)}
        </select>
        {isAdmin&&<select value={fResp} onChange={e=>setFResp(e.target.value)} style={{...S.inp,width:"auto",padding:"8px 11px",fontSize:12}}>
          <option value="Todos">Todos los responsables</option>
          {dis.map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>}
        <span style={{...S.pill("#6c5ce7","#f0edff"),marginLeft:"auto"}}>{solicitudes.length} actividades</span>
      </div>

      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["TIPO","ACTIVIDAD","ÁREA SOLICITANTE","RESPONSABLE","F. ENTREGA","H. CIERRE","ESTATUS","ALERTA","HH","TIEMPO","DÍAS",""].map((h,i)=>(
                  <th key={i} style={{padding:"9px 12px",textAlign:"left",color:"#5a7a9a",fontWeight:700,fontSize:9,letterSpacing:".06em",borderBottom:"1px solid #e9eef5",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:36,color:"#b2bec3"}}>Sin actividades — crea la primera con "＋ Nueva actividad"</td></tr>}
              {solicitudes.map(req=>{
                const tipo=tipos.find(t=>t.id===req.tipo);
                const resp=resolverResp?resolverResp(req.responableId,req.responableNombre):(dis.find(d=>d.id===req.responableId)||null);
                const c=STAT_C[req.stat]||"#b2bec3";
                const hoy=todayStr();
                const vencida=req.deadline&&hoy>req.deadline&&!["entregado","cancelado"].includes(req.stat);
                return(
                  <tr key={req.id} style={{borderBottom:"1px solid #f5f7fa",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fcff"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    onClick={e=>{if(e.target.tagName!=="BUTTON"&&e.target.tagName!=="SELECT")setVerBrief(req);}}>
                      <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:10,background:c+"12",border:"1px solid "+c+"30",width:"fit-content"}}>
                        <span style={{fontSize:15}}>{tipo?.e||"📌"}</span>
                        <span style={{fontSize:10,fontWeight:700,color:c}}>{tipo?.n||req.tipo}</span>
                      </div>
                    </td>
                    <td style={{padding:"10px 12px",minWidth:160}}>
                      <div style={{fontWeight:700,color:"#1a2f4a",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{req.titulo}</div>
                      <div style={{fontSize:9,color:"#b2bec3"}}>#{req.id?.slice(-6)} · {req.creadoEn?.slice(0,10)}</div>
                    </td>
                    <td style={{padding:"10px 8px",maxWidth:130}}>
                      <span style={{fontSize:11,color:"#5a7a9a",display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.area||"—"}</span>
                    </td>
                    <td style={{padding:"10px 8px"}}>
                      {resp
                        ?<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0}}>{resp.iniciales||getIniciales(resp.nombre)}</div>
                            <span style={{fontSize:10,fontWeight:700,color:c,background:c+"18",padding:"3px 9px",borderRadius:20,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120,display:"block"}}>{resp.nombre}</span>
                            {req.tsNotificado&&<span style={{fontSize:9,color:"#00b894",background:"#e8faf5",padding:"2px 7px",borderRadius:20,fontWeight:700,whiteSpace:"nowrap"}}>✓ Notificado</span>}
                          </div>
                        :<span style={{fontSize:10,color:"#b2bec3"}}>Sin asignar</span>}
                    </td>
                    <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
                      <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:"#5a7a9a",background:"#f0f4f8"}}>{req.fechaEntrega||req.deadline||"—"}</span>
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:"#5a7a9a",background:"#f0f4f8",whiteSpace:"nowrap"}}>
                        {req.horaCorte?(()=>{const [h,m]=req.horaCorte.split(":");const hr=parseInt(h);return (hr%12||12)+":"+(m||"00")+" "+(hr<12?"a.m.":"p.m.");})():"—"}
                      </span>
                    </td>
                    <td style={{padding:"10px 8px"}}>
                      {isAdmin
                        ?<select value={req.stat} onChange={async e=>{
                            await setDoc(doc(db,"trade_solicitudes",req.id),{...req,stat:e.target.value,updatedAt:new Date().toISOString()});
                            showToast("✅ Estado actualizado");
                          }}
                          style={{padding:"3px 9px",borderRadius:20,border:"none",background:c+"18",color:c,fontWeight:700,fontSize:10,cursor:"pointer",outline:"none",whiteSpace:"nowrap",fontFamily:"'DM Sans',system-ui,sans-serif",letterSpacing:".01em",appearance:"none",WebkitAppearance:"none"}}>
                          {Object.entries(STAT_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                        </select>
                        :<span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:c+"18",whiteSpace:"nowrap"}}>{STAT_L[req.stat]||req.stat}</span>}
                    </td>
                    <td style={{padding:"10px 8px"}}>
                      {(()=>{const a=getAlerta(req);return <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:a.c,background:a.bg,whiteSpace:"nowrap"}}>{a.label}</span>;})()}
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      {(()=>{
                        const hh=calcHHManual(req);
                        if(!hh) return <span style={{color:"#b2bec3",fontSize:11}}>—</span>;
                        return <span style={{fontWeight:700,fontSize:11,color:"#0984e3"}}>{hh}h</span>;
                      })()}
                    </td>
                    <td style={{padding:"10px 8px",minWidth:100}}>
                      {(()=>{
                        const t=calcTiempo(req);
                        if(!t.total) return <span style={{color:"#b2bec3",fontSize:11}}>—</span>;
                        const barC=t.pct>=100?"#e17055":t.pct>=70?"#f6a623":"#6c5ce7";
                        return <div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                            <span style={{fontWeight:700,color:"#1a2f4a"}}>{t.label}</span>
                            <span style={{fontWeight:700,color:barC}}>{t.pct}%</span>
                          </div>
                          <div style={{height:5,background:"#f0f4f8",borderRadius:3}}>
                            <div style={{width:Math.min(t.pct,100)+"%",height:"100%",background:barC,borderRadius:3}}/>
                          </div>
                        </div>;
                      })()}
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      {(()=>{
                        const t=calcTiempo(req);
                        return <span style={{fontSize:11,fontWeight:700,color:t.dias>t.total?"#e17055":"#1a2f4a"}}>{t.dias||"—"}</span>;
                      })()}
                    </td>

                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <div style={{display:"flex",flexDirection:"row",gap:4,alignItems:"center"}}>
                        <button onClick={()=>setVerBrief(req)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #c8d8e8",background:"#f8fafc",color:"#5a7a9a",cursor:"pointer",fontSize:10,fontWeight:700}} title="Ver brief">👁</button>
                        {isAdmin&&<button onClick={()=>editarActividad(req)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #a29bfe",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:10,fontWeight:700}}>✏️</button>}
                        {isAdmin&&req.stat==="pendiente"&&<button onClick={()=>setAssignModal(req)} style={{padding:"4px 9px",borderRadius:7,border:"1px solid #6c5ce7",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:10,fontWeight:700}}>Asignar</button>}
                        {isAdmin&&req.stat==="aprobacion"&&<>
                          <button onClick={()=>aprobarEntrega(req.id)} style={{padding:"4px 8px",borderRadius:7,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>✓</button>
                          <button onClick={()=>setRejectModal(req)} style={{padding:"4px 8px",borderRadius:7,border:"none",background:"#ffeae6",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
                        </>}
                        {isDisenador&&req.stat==="pendiente"&&req.responableNombre===uName&&<button onClick={()=>iniciarTrabajo&&iniciarTrabajo(req.id)} style={{padding:"4px 9px",borderRadius:7,border:"none",background:"#f6a623",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>▶ Iniciar</button>}
                        {isDisenador&&req.stat==="en_diseno"&&req.responableNombre===uName&&<button onClick={()=>marcarListo&&marcarListo(req.id)} style={{padding:"4px 9px",borderRadius:7,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>Listo →</button>}
                        {isAdmin&&<button onClick={()=>setDelModal(req)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:10}}>🗑️</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {assignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:400}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:4}}>Asignar responsable</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:16}}>{assignModal.titulo}</div>
            {((tradeUsers||[]).filter(u=>u.rol==="disenador"&&u.activo!==false)).map(d=>(
              <button key={d.id} onClick={()=>{asignarDis(assignModal.id,d.id);setAssignModal(null);}}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 14px",borderRadius:11,border:"1px solid #e2e8f0",background:"#fff",cursor:"pointer",marginBottom:7,textAlign:"left"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div><div style={{fontWeight:700,color:"#1a2f4a"}}>{d.nombre}</div><div style={{fontSize:10,color:"#8aaabb"}}>{d.rol} · {d.hSem}h/sem</div></div>
              </button>
            ))}
            <button onClick={()=>setAssignModal(null)} style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12,marginTop:4}}>Cancelar</button>
          </div>
        </div>
      )}

      {rejectModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:400}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:16}}>Rechazar entrega</div>
            <label style={S.lbl}>MOTIVO DE RECHAZO</label>
            <input value={rejectMotivo} onChange={e=>setRejectMotivo(e.target.value)} placeholder="¿Qué debe corregirse?" style={{...S.inp,marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{rechazarEntrega(rejectModal.id,rejectMotivo);setRejectModal(null);setRejectMotivo("");}} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#e17055,#1a2f4a)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Enviar de vuelta</button>
              <button onClick={()=>{setRejectModal(null);setRejectMotivo("");}} style={{padding:"11px 16px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:13}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {verBrief&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)",padding:"20px 16px",overflowY:"auto"}}>
          <div style={{...S.card,width:"100%",maxWidth:640,padding:0}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f0f4f8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>{verBrief.titulo}</div>
              <button onClick={()=>setVerBrief(null)} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontSize:12}}>✕ Cerrar</button>
            </div>
            <div style={{padding:20,maxHeight:"75vh",overflowY:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {[
                  {l:"Área",v:verBrief.area||"—"},
                  {l:"Tipo",v:verBrief.tipo||"—"},
                  {l:"Prioridad",v:verBrief.prioridad||"—"},
                  {l:"Solicitante",v:verBrief.creadoPor||"—"},
                  {l:"Fecha inicio",v:verBrief.fechaInicio||"—"},
                  {l:"Fecha entrega",v:verBrief.fechaEntrega||verBrief.deadline||"—"},
                  {l:"Hora de corte",v:verBrief.horaCorte||"—"},
                  {l:"HH estimadas",v:(verBrief.hEst||"—")+"h"},
                ].map(f=>(
                  <div key={f.l} style={{background:"#f8fafc",borderRadius:9,padding:"10px 12px",border:"1px solid #e2e8f0"}}>
                    <div style={{fontSize:9,color:"#8aaabb",fontWeight:700,marginBottom:3}}>{f.l.toUpperCase()}</div>
                    <div style={{fontSize:12,fontWeight:600,color:"#1a2f4a"}}>{f.v}</div>
                  </div>
                ))}
              </div>
              {verBrief.objetivo&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",marginBottom:4}}>OBJETIVO</div><div style={{fontSize:12,color:"#1a2f4a",background:"#f8fafc",padding:"10px 12px",borderRadius:9,border:"1px solid #e2e8f0"}}>{verBrief.objetivo}</div></div>}
              {verBrief.mensaje&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",marginBottom:4}}>MENSAJE PRINCIPAL</div><div style={{fontSize:12,color:"#1a2f4a",background:"#f8fafc",padding:"10px 12px",borderRadius:9,border:"1px solid #e2e8f0"}}>{verBrief.mensaje}</div></div>}
              {verBrief.materiales&&verBrief.materiales.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",marginBottom:6}}>MATERIALES</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{verBrief.materiales.map(m=><span key={m} style={{padding:"3px 9px",borderRadius:20,background:"#f0edff",color:"#6c5ce7",fontSize:11,fontWeight:600}}>{m}</span>)}</div></div>}
              {verBrief.medidas&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",marginBottom:4}}>MEDIDAS</div><div style={{fontSize:12,color:"#1a2f4a",background:"#f8fafc",padding:"10px 12px",borderRadius:9,border:"1px solid #e2e8f0"}}>{verBrief.medidas}</div></div>}
              {verBrief.restricciones&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#e17055",marginBottom:4}}>RESTRICCIONES</div><div style={{fontSize:12,color:"#1a2f4a",background:"#fff1ee",padding:"10px 12px",borderRadius:9,border:"1px solid #fecdc7"}}>{verBrief.restricciones}</div></div>}
              {verBrief.comentarios&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:"#5a7a9a",marginBottom:4}}>COMENTARIOS</div><div style={{fontSize:12,color:"#1a2f4a",background:"#f8fafc",padding:"10px 12px",borderRadius:9,border:"1px solid #e2e8f0"}}>{verBrief.comentarios}</div></div>}
              {verBrief.obs&&<div style={{padding:"10px 12px",borderRadius:9,background:"#fff8ec",border:"1px solid #fde68a"}}><div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:3}}>OBSERVACIÓN</div><div style={{fontSize:12,color:"#78350f"}}>{verBrief.obs}</div></div>}
            </div>
          </div>
        </div>
      )}

      {delModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:6}}>¿Eliminar actividad?</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:16}}>{delModal.titulo}</div>
            <div style={{padding:"8px 12px",borderRadius:8,background:"#fff1f2",border:"1px solid #fecaca",fontSize:11,color:"#dc2626",marginBottom:18}}>Esta acción no se puede deshacer.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDelModal(null)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:13}}>Cancelar</button>
              <button onClick={()=>{eliminarSolicitud(delModal.id);setDelModal(null);}} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#dc2626,#991b1b)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ TAB BRIEF ══════════════════════════════════════════ */
function TabBrief({S,brief,setBrief,config,guardarSolicitud,isAdmin,isViewer,editMode,onCancel,solicitudes}){
  const tipos=config.tipos||[];
  const areas=config.areas||AREAS_DEFAULT;
  const set=(k,v)=>setBrief(p=>({...p,[k]:v}));
  const toggleMat=(m)=>setBrief(p=>({...p,materiales:p.materiales.includes(m)?p.materiales.filter(x=>x!==m):[...p.materiales,m]}));
  const [disenadoresUsers,setDisenadoresUsers]=useState([]);
  const [tradeAdmins,setTradeAdmins]=useState([]);
  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db,"trade_users"),where("rol","==","disenador"),where("activo","==",true)),snap=>{
      const arr=[];snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      setDisenadoresUsers(arr);
    });
    const unsub2=onSnapshot(query(collection(db,"trade_users"),where("rol","==","admin"),where("activo","==",true)),snap=>{
      const arr=[];snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      setTradeAdmins(arr);
    });
    return()=>{unsub();unsub2();};
  },[]);
  const disenadoresList = disenadoresUsers.length>0 ? disenadoresUsers : [];
  return(
    <div style={{maxWidth:"100%"}}>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:"#1a2f4a",marginBottom:3}}>{editMode?"Editar actividad":"Nueva actividad de diseño"}</div>
      <div style={{fontSize:11,color:"#8aaabb",marginBottom:18}}>Completa el brief — el equipo de diseño lo recibirá automáticamente</div>
      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={1} label="Información general" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>TÍTULO <span style={{color:"#e17055"}}>*</span></label><input value={brief.titulo} onChange={e=>set("titulo",e.target.value)} placeholder="Ej: Catálogo Verano 2026" style={S.inp}/></div>
          <div><label style={S.lbl}>SOLICITANTE</label><input value={brief.solicitante} onChange={e=>set("solicitante",e.target.value)} style={S.inp}/></div>
          <div><label style={S.lbl}>ÁREA</label><select value={brief.area} onChange={e=>set("area",e.target.value)} style={S.inp}>{areas.map(a=><option key={a}>{a}</option>)}</select></div>
          <div><label style={S.lbl}>FECHA INICIO <span style={{color:"#e17055"}}>*</span></label><input type="date" value={brief.fechaInicio} onChange={e=>set("fechaInicio",e.target.value)} style={S.inp}/></div>
          {!isViewer&&<div><label style={S.lbl}>FECHA ENTREGA <span style={{color:"#e17055"}}>*</span></label><input type="date" value={brief.fechaEntrega} onChange={e=>set("fechaEntrega",e.target.value)} style={S.inp}/></div>}
          {!isViewer&&<div><label style={S.lbl}>HORA DE INICIO</label><input type="time" value={brief.horaInicio} onChange={e=>set("horaInicio",e.target.value)} style={S.inp}/></div>}
          {!isViewer&&<div><label style={S.lbl}>HORA DE CORTE <span style={{fontSize:9,color:"#8aaabb",fontWeight:400}}>(pasada esta hora → retraso)</span></label><input type="time" value={brief.horaCorte} onChange={e=>set("horaCorte",e.target.value)} style={S.inp}/></div>}
          <div><label style={S.lbl}>PRIORIDAD</label><select value={brief.prioridad} onChange={e=>set("prioridad",e.target.value)} style={S.inp}>{["Normal","Media","Alta","Urgente"].map(p=><option key={p}>{p}</option>)}</select></div>
          {isViewer&&<div style={{gridColumn:"1/-1"}}>
            <label style={S.lbl}>NOTIFICAR A <span style={{color:"#e17055"}}>*</span> <span style={{color:"#8aaabb",fontWeight:400}}>(selecciona quién del equipo Trade recibirá tu solicitud)</span></label>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {tradeAdmins.map(u=>(
                <label key={u.id} onClick={()=>{const arr=brief.notificarA||[];set("notificarA",arr.includes(u.id)?arr.filter(x=>x!==u.id):[...arr,u.id]);}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:"1.5px solid "+((brief.notificarA||[]).includes(u.id)?"#6c5ce7":"#e2e8f0"),background:(brief.notificarA||[]).includes(u.id)?"#f0edff":"#fff",cursor:"pointer"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,flexShrink:0}}>{getIniciales(u.nombre)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:(brief.notificarA||[]).includes(u.id)?"#6c5ce7":"#1a2f4a"}}>{u.nombre}</div>
                    <div style={{fontSize:10,color:"#8aaabb"}}>{u.area||"Trade Marketing"} · {u.email||"sin correo"}</div>
                  </div>
                  <div style={{width:18,height:18,borderRadius:4,border:"2px solid "+((brief.notificarA||[]).includes(u.id)?"#6c5ce7":"#c8d8e8"),background:(brief.notificarA||[]).includes(u.id)?"#6c5ce7":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {(brief.notificarA||[]).includes(u.id)&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                </label>
              ))}
              {(brief.notificarA||[]).length===0&&<div style={{fontSize:11,color:"#e17055",padding:"6px 0"}}>⚠ Selecciona al menos una persona</div>}
            </div>
          </div>}
          {!isViewer&&<div style={{gridColumn:"1/-1"}}>
            <label style={S.lbl}>RESPONSABLE <span style={{color:"#8aaabb",fontWeight:400}}>(solo admin — asigna al diseñador)</span></label>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              <label onClick={()=>set("responableId","")} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:10,border:"1.5px solid "+(brief.responableId===""?"#6c5ce7":"#e2e8f0"),background:brief.responableId===""?"#f0edff":"#fff",cursor:"pointer",fontSize:12,color:brief.responableId===""?"#6c5ce7":"#5a7a9a",fontWeight:brief.responableId===""?700:400}}>
                <input type="radio" name="resp" checked={brief.responableId===""} onChange={()=>set("responableId","")} style={{display:"none"}}/>
                <div style={{width:26,height:26,borderRadius:"50%",background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>—</div>
                <span>Sin asignar</span>
              </label>
              {disenadoresList.map(d=>{
                const disp=getDisponibilidad(d.id,solicitudes||[],brief.fechaEntrega,brief.horaCorte,d.nombre);
                const bC=disp.nivel==="libre"?"#00b894":disp.nivel==="ocupado"?"#f6a623":"#e17055";
                const selC=brief.responableId===d.id?"#6c5ce7":"#e2e8f0";
                return(
                <div key={d.id} style={{border:"1.5px solid "+(disp.bloquear?"#fecaca":brief.responableId===d.id?"#6c5ce7":"#e2e8f0"),borderRadius:10,overflow:"hidden",cursor:disp.bloquear?"not-allowed":"pointer",background:disp.bloquear?"#fff5f5":brief.responableId===d.id?"#f0edff":"#fff",opacity:disp.bloquear?0.7:1}}
                  onClick={()=>{if(disp.bloquear){return;}set("responableId",d.id);set("responableNombre",d.nombre);}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px"}}>
                    <input type="radio" name="resp" checked={brief.responableId===d.id} onChange={()=>{set("responableId",d.id);set("responableNombre",d.nombre);}} style={{display:"none"}}/>
                    <div style={{position:"relative",flexShrink:0}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                      <div style={{position:"absolute",bottom:-1,right:-1,width:10,height:10,borderRadius:"50%",background:bC,border:"2px solid #fff"}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:brief.responableId===d.id?"#6c5ce7":"#1a2f4a"}}>{d.nombre}</div>
                      <div style={{fontSize:10,color:bC,fontWeight:600}}>{disp.msg}</div>
                    </div>
                    {disp.activos>0&&<div style={{padding:"2px 8px",borderRadius:20,background:bC+"18",color:bC,fontSize:10,fontWeight:700}}>{disp.activos} activa{disp.activos!==1?"s":""}</div>}
                  </div>
                  {disp.nivel==="sobrecargado"&&<div style={{padding:"5px 14px",background:"#fff1ee",borderTop:"1px solid #fecdc7",fontSize:10,color:"#e17055",fontWeight:600}}>⚠ Sobrecargado — considera reasignar o ajustar fecha</div>}
                  {disp.nivel==="ocupado"&&<div style={{padding:"5px 14px",background:"#fff8ec",borderTop:"1px solid #fde68a",fontSize:10,color:"#92400e",fontWeight:600}}>⚡ Tiene tareas que se cruzan con esta fecha de entrega</div>}
                </div>
                );
              })}
            </div>
          </div>}
        </div>
      </div>
      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={2} label="Tipo de actividad" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
          {tipos.filter(t=>t.activo!==false).map(t=>(
            <label key={t.id} onClick={()=>set("tipo",t.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 11px",borderRadius:10,border:"1.5px solid "+(brief.tipo===t.id?"#6c5ce7":"#e2e8f0"),background:brief.tipo===t.id?"#f0edff":"#fff",cursor:"pointer"}}>
              <input type="radio" name="tipo" checked={brief.tipo===t.id} onChange={()=>set("tipo",t.id)} style={{accentColor:"#6c5ce7"}}/><span style={{fontSize:13}}>{t.e}</span><span style={{fontSize:11,fontWeight:700,color:brief.tipo===t.id?"#6c5ce7":"#1a2f4a"}}>{t.n}</span>
            </label>
          ))}
        </div>
        <div style={{marginBottom:10}}><label style={S.lbl}>OBJETIVO Y PÚBLICO</label><textarea value={brief.objetivo} onChange={e=>set("objetivo",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/></div>
        <div><label style={S.lbl}>MENSAJE PRINCIPAL</label><textarea value={brief.mensaje} onChange={e=>set("mensaje",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/></div>
      </div>
      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={3} label="Materiales y medidas" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
          {MATERIALES.map(m=>(
            <label key={m} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",borderRadius:9,border:"1px solid "+(brief.materiales.includes(m)?"#6c5ce7":"#e2e8f0"),background:brief.materiales.includes(m)?"#f0edff":"#fff",cursor:"pointer",fontSize:11}}>
              <input type="checkbox" checked={brief.materiales.includes(m)} onChange={()=>toggleMat(m)} style={{accentColor:"#6c5ce7"}}/>{m}
            </label>
          ))}
        </div>
        <div><label style={S.lbl}>MEDIDAS ESPECÍFICAS</label><input value={brief.medidas} onChange={e=>set("medidas",e.target.value)} placeholder="Ej: 1080×1920px / A3 vertical" style={S.inp}/></div>
      </div>
      <div style={{...S.card,padding:18,marginBottom:16}}>
        <SectionHeader n={4} label="Estilo y referencias" color="#6c5ce7"/>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>TONALIDAD</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {TONOS.map(t=>(
              <label key={t} onClick={()=>set("tono",t)} style={{padding:"6px 13px",borderRadius:20,border:"1.5px solid "+(brief.tono===t?"#6c5ce7":"#e2e8f0"),background:brief.tono===t?"#f0edff":"#fff",cursor:"pointer",fontSize:11,fontWeight:brief.tono===t?700:400,color:brief.tono===t?"#6c5ce7":"#5a7a9a"}}>
                <input type="radio" name="tono" checked={brief.tono===t} onChange={()=>set("tono",t)} style={{display:"none"}}/>{t}
              </label>
            ))}
          </div>
        </div>
        <div style={{marginBottom:10}}><label style={S.lbl}>MECÁNICA / DINÁMICA</label><textarea value={brief.mecanica} onChange={e=>set("mecanica",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/></div>
        <div style={{marginBottom:10}}><label style={S.lbl}>PRODUCTOS INVOLUCRADOS</label><input value={brief.productosInvolucrados} onChange={e=>set("productosInvolucrados",e.target.value)} style={S.inp}/></div>
        <div style={{marginBottom:10}}><label style={S.lbl}>RESTRICCIONES</label><input value={brief.restricciones} onChange={e=>set("restricciones",e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>COMENTARIOS / REFERENCIAS</label><textarea value={brief.comentarios} onChange={e=>set("comentarios",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/></div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        {onCancel&&<button onClick={onCancel} style={{padding:"12px 20px",borderRadius:11,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:13,fontWeight:700}}>Cancelar</button>}
        <button onClick={async()=>{
          const emailData = await guardarSolicitud();
          if(emailData&&emailData.tipo==="email"){
            abrirEmail(emailData.emails,emailData.asunto,emailData.cuerpo);
          }
        }} style={{...S.btn("#6c5ce7"),padding:"12px 28px",fontSize:13}}>{editMode?"Guardar cambios":"Crear actividad →"}</button>
      </div>
    </div>
  );
}

function SectionHeader({n,label,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff",flexShrink:0}}>{n}</div>
      <span style={{fontSize:11,fontWeight:800,color:color,letterSpacing:".05em"}}>{label.toUpperCase()}</span>
    </div>
  );
}

function BriefModal({S,brief,setBrief,config,guardarSolicitud,onClose,isAdmin,editMode,solicitudes}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.65)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)",padding:"20px 16px",overflowY:"auto"}}>
      <div style={{...S.card,width:"100%",maxWidth:740,padding:0,position:"relative"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #f0f4f8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#1a2f4a"}}>{editMode?"Editar actividad":"Nueva actividad de diseño"}</div>
          <button onClick={onClose} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>✕ Cerrar</button>
        </div>
        <div style={{padding:20,maxHeight:"80vh",overflowY:"auto"}}>
          <TabBrief S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} isAdmin={isAdmin} editMode={editMode} onCancel={onClose} solicitudes={solicitudes}/>
        </div>
      </div>
    </div>
  );
}

/* ══ TAB KANBAN ════════════════════════════════════════ */
function TabKanban({S,solicitudes,config,isAdmin,isDisenador,asignarDis,marcarListo,iniciarTrabajo,aprobarEntrega,rechazarEntrega,uName,showToast,resolverResp,tradeUsers}){
  const dis=(tradeUsers||[]).filter(u=>u.rol==="disenador"&&u.activo!==false);
  const tipos=config.tipos||[];
  const [assignModal,setAssignModal]=useState(null);
  const [rejectModal,setRejectModal]=useState(null);
  const [rejectMotivo,setRejectMotivo]=useState("");
  const cols=[
    {id:"pendiente", label:"Pendiente",    c:"#f6a623",ids:["pendiente"]},
    {id:"en_diseno", label:"En diseño",    c:"#6c5ce7",ids:["en_diseno"]},
    {id:"aprobacion",label:"En aprobación",c:"#0984e3",ids:["aprobacion"]},
    {id:"entregado", label:"Entregado",    c:"#00b894",ids:["entregado","retrasado"]},
  ];
  const getByStat=ids=>solicitudes.filter(s=>ids.includes(s.stat));
  return(
    <div>
      {!isDisenador&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:16}}>
        {dis.filter(d=>d.activo!==false).map(d=>{
          const activos=solicitudes.filter(s=>s.responableId===d.id&&["en_diseno","aprobacion"].includes(s.stat));
          const hUsadas=solicitudes.filter(s=>s.responableId===d.id&&s.hReal>0).reduce((a,s)=>a+s.hReal,0);
          const pct=Math.round((hUsadas/(d.hSem||48))*100);
          return(
            <div key={d.id} style={{...S.card,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div><div style={{fontWeight:700,fontSize:12}}>{d.nombre}</div><div style={{fontSize:9,color:"#8aaabb"}}>Team Diseño</div></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                <span style={{color:"#5a7a9a"}}>HH semana</span>
                <span style={{fontWeight:700,color:pct>80?"#e17055":pct>60?"#f6a623":"#00b894"}}>{Math.round(hUsadas*10)/10}h / {d.hSem}h</span>
              </div>
              <div style={{height:5,background:"#f0f4f8",borderRadius:3,marginBottom:6}}>
                <div style={{width:Math.min(pct,100)+"%",height:"100%",background:pct>80?"#e17055":pct>60?"#f6a623":"#00b894",borderRadius:3}}/>
              </div>
              <div style={{fontSize:10,color:activos.length>0?"#6c5ce7":"#00b894",fontWeight:700}}>{activos.length} trabajo{activos.length!==1?"s":""} activo{activos.length!==1?"s":""}</div>
            </div>
          );
        })}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {cols.map(col=>{
          const items=getByStat(col.ids);
          return(
            <div key={col.id}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,padding:"0 4px"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:col.c}}/>
                <span style={{fontSize:10,fontWeight:800,color:"#5a7a9a",letterSpacing:".05em"}}>{col.label.toUpperCase()}</span>
                <span style={{padding:"1px 7px",borderRadius:20,fontSize:9,fontWeight:700,background:col.c+"18",color:col.c,marginLeft:2}}>{items.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {items.map(req=>{
                  const tipo=tipos.find(t=>t.id===req.tipo);
                  const resp=resolverResp?resolverResp(req.responableId,req.responableNombre):(dis.find(d=>d.id===req.responableId)||null);
                  const c=STAT_C[req.stat]||"#b2bec3";
                  const vencida=req.deadline&&todayStr()>req.deadline&&!["entregado","cancelado"].includes(req.stat);
                  return(
                    <div key={req.id} style={{...S.card,padding:12,borderLeft:"3px solid "+c}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#1a2f4a",marginBottom:4,lineHeight:1.3}}>{req.titulo}</div>
                      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                        <span style={{padding:"1px 6px",borderRadius:20,fontSize:9,fontWeight:700,background:c+"18",color:c}}>{tipo?.e||"📌"} {tipo?.n||req.tipo}</span>
                        {vencida&&<span style={{padding:"1px 6px",borderRadius:20,fontSize:9,fontWeight:700,background:"#ffeae6",color:"#dc2626"}}>⚠ VENCIDO</span>}
                      </div>
                      {resp&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                        <div style={{width:18,height:18,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{resp.iniciales||getIniciales(resp.nombre)}</div>
                        <span style={{fontSize:9,color:"#5a7a9a"}}>{resp.nombre.split(" ")[0]}</span>
                        {req.hReal>0&&<span style={{fontSize:9,fontWeight:700,color:"#0984e3",marginLeft:"auto"}}>{req.hReal}h</span>}
                      </div>}
                      <div style={{fontSize:9,color:vencida?"#e17055":"#8aaabb",fontWeight:vencida?700:400,marginBottom:8}}>Deadline: {req.deadline||"—"}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {isAdmin&&req.stat==="pendiente"&&<button onClick={()=>setAssignModal(req)} style={{flex:1,padding:"5px 8px",borderRadius:7,border:"1px solid #6c5ce7",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:10,fontWeight:700}}>Asignar</button>}
                        {isDisenador&&req.stat==="pendiente"&&req.responableNombre===uName&&<button onClick={()=>iniciarTrabajo(req.id)} style={{flex:1,padding:"5px 8px",borderRadius:7,border:"none",background:"#f6a623",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>▶ Iniciar</button>}
                        {isDisenador&&req.stat==="en_diseno"&&req.responableNombre===uName&&<button onClick={()=>marcarListo(req.id)} style={{flex:1,padding:"5px 8px",borderRadius:7,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>Listo →</button>}
                        {isAdmin&&req.stat==="aprobacion"&&<>
                          <button onClick={()=>aprobarEntrega(req.id)} style={{flex:1,padding:"5px 7px",borderRadius:7,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>✓</button>
                          <button onClick={()=>setRejectModal(req)} style={{padding:"5px 8px",borderRadius:7,border:"none",background:"#ffeae6",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
                        </>}
                      </div>
                    </div>
                  );
                })}
                {items.length===0&&<div style={{padding:"20px 14px",borderRadius:10,border:"1.5px dashed #e2e8f0",textAlign:"center",fontSize:11,color:"#b2bec3"}}>Sin actividades</div>}
              </div>
            </div>
          );
        })}
      </div>
      {assignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:24,width:"90%",maxWidth:380}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:4,color:"#1a2f4a"}}>Asignar responsable</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:14}}>{assignModal.titulo}</div>
            {dis.filter(d=>d.activo!==false).map(d=>(
              <button key={d.id} onClick={()=>{asignarDis(assignModal.id,d.id);setAssignModal(null);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 13px",borderRadius:10,border:"1px solid #e2e8f0",background:"#fff",cursor:"pointer",marginBottom:6,textAlign:"left"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div><div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{d.nombre}</div><div style={{fontSize:9,color:"#8aaabb"}}>Team Diseño</div></div>
              </button>
            ))}
            <button onClick={()=>setAssignModal(null)} style={{width:"100%",padding:"9px",borderRadius:9,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12,marginTop:4}}>Cancelar</button>
          </div>
        </div>
      )}
      {rejectModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:24,width:"90%",maxWidth:380}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:14,color:"#1a2f4a"}}>Rechazar entrega</div>
            <label style={S.lbl}>MOTIVO</label>
            <input value={rejectMotivo} onChange={e=>setRejectMotivo(e.target.value)} style={{...S.inp,marginBottom:12}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{rechazarEntrega(rejectModal.id,rejectMotivo);setRejectModal(null);setRejectMotivo("");}} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#e17055,#1a2f4a)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Enviar de vuelta</button>
              <button onClick={()=>{setRejectModal(null);setRejectMotivo("");}} style={{padding:"10px 14px",borderRadius:9,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ TAB DASHBOARD ══════════════════════════════════════ */
function TabDashboard({S,solicitudes,config,kpis,dashLvl,setDashLvl,gYear,setGYear,gMonth,setGMonth,gFiltResp,setGFiltResp,gFiltTipo,setGFiltTipo,gFiltStat,setGFiltStat,selReq,setSelReq,isDisenador,tradeUsers}){
  const dis=(tradeUsers||[]).filter(u=>u.rol==="disenador"&&u.activo!==false);
  const tipos=config.tipos||[];
  const hoy=todayStr();
  const vencen7=solicitudes.filter(s=>s.deadline&&!["entregado","cancelado"].includes(s.stat)&&new Date(s.deadline)>=new Date(hoy)&&new Date(s.deadline)-new Date(hoy)<=7*86400000);
  const retrasadas=solicitudes.filter(s=>s.stat==="retrasado"||(s.deadline&&hoy>s.deadline&&!["entregado","cancelado"].includes(s.stat)));
  const nivelesDisponibles=isDisenador
    ?[{n:3,label:"Mis trabajos",sub:"Vista personal",icon:"🎨"}]
    :[{n:1,label:"Dirección",sub:"Visión ejecutiva",icon:"👑"},{n:2,label:"Gerencia",sub:"Análisis y causas",icon:"📊"},{n:3,label:"Operativo",sub:"Seguimiento diario",icon:"⚙️"}];
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {nivelesDisponibles.map(l=>(
          <button key={l.n} onClick={()=>setDashLvl(l.n)} style={{flex:1,padding:"12px 10px",borderRadius:12,border:"2px solid "+(dashLvl===l.n?"#6c5ce7":"#e2e8f0"),background:dashLvl===l.n?"#1a2f4a":"#fff",color:dashLvl===l.n?"#fff":"#5a7a9a",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
            <div style={{fontSize:18,marginBottom:4}}>{l.icon}</div>
            <div style={{fontSize:11,fontWeight:800}}>{l.label}</div>
            <div style={{fontSize:9,opacity:.7,marginTop:2}}>{l.sub}</div>
          </button>
        ))}
      </div>

      {dashLvl===1&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
            {[{label:"TOTAL",val:kpis.total,c:"#6c5ce7"},{label:"TERMINADAS",val:kpis.ok,c:"#00b894"},{label:"EN PROCESO",val:kpis.active,c:"#0984e3"},{label:"PENDIENTES",val:kpis.pend,c:"#f6a623"},{label:"CON RETRASO",val:kpis.delay,c:"#e17055"}].map(k=>(
              <div key={k.label} style={{...S.card,padding:"18px 14px",textAlign:"center",borderTop:"3px solid "+k.c}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:36,fontWeight:800,color:k.c,lineHeight:1}}>{k.val}</div>
                <div style={{fontSize:9,color:"#8aaabb",fontWeight:700,marginTop:6,letterSpacing:".05em"}}>{k.label}</div>
              </div>
            ))}
          </div>
          <div style={{...S.card,padding:"18px 20px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:800,fontSize:13,color:"#1a2f4a"}}>Avance global</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:sc(kpis.efic)}}>{kpis.efic}%</div>
            </div>
            <div style={{height:12,borderRadius:6,overflow:"hidden",display:"flex",marginBottom:12}}>
              {kpis.total>0&&<><div style={{width:(kpis.ok/kpis.total*100)+"%",background:"#00b894"}}/><div style={{width:(kpis.active/kpis.total*100)+"%",background:"#0984e3"}}/><div style={{width:(kpis.pend/kpis.total*100)+"%",background:"#f6a623"}}/><div style={{width:(kpis.delay/kpis.total*100)+"%",background:"#e17055"}}/></>}
              {kpis.total===0&&<div style={{width:"100%",background:"#e2e8f0"}}/>}
            </div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {[{label:kpis.ok+" Terminadas",c:"#00b894"},{label:kpis.active+" En proceso",c:"#0984e3"},{label:kpis.pend+" Pendientes",c:"#f6a623"},{label:kpis.delay+" Con retraso",c:"#e17055"}].map(l=>(
                <div key={l.label} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:l.c}}/><span style={{fontSize:11,color:"#5a7a9a"}}>{l.label}</span></div>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div style={{...S.card,padding:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:16}}>⏰</span><div style={{fontWeight:800,fontSize:13,color:"#1a2f4a"}}>Vencen en 7 días</div><span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:20,background:"#fff8ec",color:"#f6a623",fontWeight:800,fontSize:12}}>{vencen7.length}</span></div>
              {vencen7.slice(0,5).map(s=>{const tipo=tipos.find(t=>t.id===s.tipo);const diff=Math.ceil((new Date(s.deadline)-new Date(hoy))/86400000);return(<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f5f7fa"}}><span style={{fontSize:16,flexShrink:0}}>{tipo?.e||"📌"}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:12,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.titulo}</div><div style={{fontSize:10,color:"#8aaabb"}}>{s.deadline}</div></div><span style={{padding:"2px 8px",borderRadius:20,background:"#fff8ec",color:"#f6a623",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{diff===0?"Hoy":diff===1?"Mañana":diff+"d"}</span></div>);})}
              {vencen7.length===0&&<div style={{fontSize:12,color:"#b2bec3",textAlign:"center",padding:"20px 0"}}>Sin vencimientos próximos ✅</div>}
            </div>
            <div style={{...S.card,padding:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:16}}>🔴</span><div style={{fontWeight:800,fontSize:13,color:"#1a2f4a"}}>Con retraso</div><span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:20,background:"#ffeae6",color:"#e17055",fontWeight:800,fontSize:12}}>{retrasadas.length}</span></div>
              {retrasadas.slice(0,5).map(s=>{const tipo=tipos.find(t=>t.id===s.tipo);const resp=dis.find(d=>d.id===s.responableId);return(<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f5f7fa"}}><span style={{fontSize:16,flexShrink:0}}>{tipo?.e||"📌"}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:12,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.titulo}</div><div style={{fontSize:10,color:"#8aaabb"}}>{resp?.nombre||"Sin asignar"}</div></div><span style={{padding:"2px 8px",borderRadius:20,background:"#ffeae6",color:"#dc2626",fontWeight:700,fontSize:10}}>RETRASADO</span></div>);})}
              {retrasadas.length===0&&<div style={{fontSize:12,color:"#b2bec3",textAlign:"center",padding:"20px 0"}}>Sin retrasos ✅</div>}
            </div>
          </div>
          <GanttDiario S={S} solicitudes={solicitudes} config={config} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} showResp={false} tradeUsers={tradeUsers}/>
        </div>
      )}

      {dashLvl===2&&(
        <div>
          <GanttDiario S={S} solicitudes={solicitudes} config={config} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} showResp={true} tradeUsers={tradeUsers}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
            <div style={{...S.card,padding:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#e17055",marginBottom:12}}>Causa raíz de retrasos</div>
              {solicitudes.filter(s=>s.stat==="retrasado"&&s.obs).slice(0,5).map(s=>(
                <div key={s.id} style={{padding:"8px 10px",borderRadius:9,background:"#fff8ec",border:"1px solid #FAC775",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#854F0B",marginBottom:2}}>{s.titulo}</div>
                  <div style={{fontSize:9,color:"#633806"}}>{s.obs?.slice(0,80)}</div>
                </div>
              ))}
              {solicitudes.filter(s=>s.stat==="retrasado").length===0&&<div style={{fontSize:12,color:"#b2bec3",textAlign:"center",padding:"20px 0"}}>Sin retrasos ✅</div>}
            </div>
            <div style={{...S.card,padding:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#1a2f4a",marginBottom:12}}>Rendimiento por diseñador</div>
              {dis.filter(d=>d.activo!==false).map(d=>{
                const dSols=solicitudes.filter(s=>s.responableId===d.id);
                const dOk=dSols.filter(s=>s.stat==="entregado").length;
                const dDel=dSols.filter(s=>s.stat==="retrasado").length;
                const dHR=dSols.reduce((a,s)=>a+(s.hReal||0),0);
                const ef=dSols.length>0?Math.round((dOk/(dOk+dDel||1))*100):null;
                return(
                  <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f7fa"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,flexShrink:0}}>{d.iniciales||getIniciales(d.nombre)}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,fontWeight:700,color:"#1a2f4a"}}>{d.nombre}</span><span style={{fontSize:10,fontWeight:700,color:ef!==null?sc(ef):"#b2bec3"}}>{ef!==null?ef+"%":"—"}</span></div>
                      <div style={{fontSize:9,color:"#8aaabb"}}>{dOk} a tiempo · {dDel} retrasados · {Math.round(dHR*10)/10}h</div>
                      <div style={{height:3,background:"#f0f4f8",borderRadius:2,marginTop:3}}>{ef!==null&&<div style={{width:ef+"%",height:"100%",background:sc(ef),borderRadius:2}}/>}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {dashLvl===3&&(
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#5a7a9a",letterSpacing:".05em",marginBottom:12}}>HOY — {new Date().toLocaleDateString("es-PE",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).toUpperCase()}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[{label:"En proceso",val:solicitudes.filter(s=>["en_diseno","aprobacion"].includes(s.stat)).length,c:"#6c5ce7",icon:"🎨"},{label:"Vencen hoy",val:solicitudes.filter(s=>s.deadline===todayStr()&&!["entregado","cancelado"].includes(s.stat)).length,c:"#e17055",icon:"⚠️"},{label:"Entregados hoy",val:solicitudes.filter(s=>s.tsEntregado?.slice(0,10)===todayStr()).length,c:"#00b894",icon:"✅"}].map(k=>(
              <div key={k.label} style={{...S.card,padding:14,borderLeft:"4px solid "+k.c}}><div style={{fontSize:9,color:"#8aaabb",fontWeight:700,marginBottom:5}}>{k.label.toUpperCase()}</div><div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:k.c}}>{k.val}</div></div>
            ))}
          </div>
          <div style={{...S.card,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #f0f4f8",fontWeight:800,fontSize:13,color:"#1a2f4a"}}>Trabajos activos</div>
            {solicitudes.filter(s=>["en_diseno","aprobacion","pendiente"].includes(s.stat)).slice(0,10).map(req=>{
              const tipo=tipos.find(t=>t.id===req.tipo);
              const resp=dis.find(d=>d.id===req.responableId);
              const c=STAT_C[req.stat]||"#b2bec3";
              const vencida=req.deadline&&todayStr()>req.deadline;
              return(
                <div key={req.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid #f5f7fa"}}>
                  <div style={{width:4,height:36,borderRadius:2,background:c,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.titulo}</div><div style={{fontSize:9,color:"#8aaabb"}}>{tipo?.e||"📌"} {tipo?.n||req.tipo} · {req.area}</div></div>
                  {resp&&<div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:22,height:22,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{resp.iniciales||getIniciales(resp.nombre)}</div><span style={{fontSize:10,color:"#5a7a9a"}}>{resp.nombre.split(" ")[0]}</span></div>}
                  <div><div style={{fontSize:10,fontWeight:700,color:vencida?"#e17055":"#5a7a9a"}}>{req.deadline||"—"}</div>{vencida&&<div style={{fontSize:8,color:"#e17055",fontWeight:700}}>VENCIDO</div>}</div>
                  <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:c+"18"}}>{STAT_L[req.stat]||req.stat}</span>
                </div>
              );
            })}
            {solicitudes.filter(s=>["en_diseno","aprobacion","pendiente"].includes(s.stat)).length===0&&<div style={{textAlign:"center",padding:"32px",color:"#b2bec3",fontSize:12}}>Sin trabajos activos ✅</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ GANTT DIARIO ════════════════════════════════════════ */
function GanttDiario({S,solicitudes,config,gYear,setGYear,gMonth,setGMonth,gFiltResp,setGFiltResp,gFiltTipo,setGFiltTipo,gFiltStat,setGFiltStat,selReq,setSelReq,showResp,tradeUsers}){
  const dias=diasEnMes(gYear,gMonth);
   const dis=(tradeUsers||[]).filter(u=>u.rol==="disenador"&&u.activo!==false);
  const tipos=config.tipos||[];
  const hoy=todayStr();
  const navMes=dir=>{let m=gMonth+dir,y=gYear;if(m<0){m=11;y--;}if(m>11){m=0;y++;}setGMonth(m);setGYear(y);};
  const filtered=useMemo(()=>solicitudes.filter(s=>{
    const si=s.creadoEn?.slice(0,7);const sd=s.deadline?.slice(0,7);const ym=gYear+"-"+String(gMonth+1).padStart(2,"0");
    if(si>ym&&sd<ym)return false;if(!s.creadoEn&&!s.deadline)return false;
    if(gFiltResp&&s.responableId!==gFiltResp)return false;
    if(gFiltTipo&&s.tipo!==gFiltTipo)return false;
    if(gFiltStat&&s.stat!==gFiltStat)return false;
    return true;
  }),[solicitudes,gYear,gMonth,gFiltResp,gFiltTipo,gFiltStat]);
  const getDayInMonth=dateStr=>{if(!dateStr)return null;const[y,m,d]=dateStr.split("-").map(Number);if(y===gYear&&m===gMonth+1)return d;if(new Date(dateStr)<new Date(gYear,gMonth,1))return 0;if(new Date(dateStr)>new Date(gYear,gMonth+1,0))return dias+1;return null;};
  const today=new Date();const todayD=today.getFullYear()===gYear&&today.getMonth()===gMonth?today.getDate():null;
  const INFO_W=showResp?320:280;
  return(
    <div style={{...S.card,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid #f0f4f8"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <button onClick={()=>navMes(-1)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>←</button>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#1a2f4a",flex:1,textAlign:"center"}}>{MESES_N[gMonth].toUpperCase()} {gYear}</span>
          <button onClick={()=>navMes(1)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>→</button>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <select value={gFiltResp} onChange={e=>setGFiltResp(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}><option value="">Todos los responsables</option>{dis.map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
          <select value={gFiltTipo} onChange={e=>setGFiltTipo(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}><option value="">Todos los tipos</option>{tipos.map(t=><option key={t.id} value={t.id}>{t.e} {t.n}</option>)}</select>
          <select value={gFiltStat} onChange={e=>setGFiltStat(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}><option value="">Todos los estados</option>{Object.entries(STAT_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {[["#00b894","Entregado"],["#6c5ce7","En diseño"],["#e17055","Retrasado"],["#f6a623","Pendiente"]].map(([c,l])=>(
              <span key={l} style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:c+"18"}}>● {l}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"500px"}}>
        <div style={{minWidth:Math.max(900,INFO_W+dias*26)+"px"}}>
          <div style={{display:"flex",alignItems:"stretch",background:"#f8fafc",borderBottom:"2px solid #e2e8f0",position:"sticky",top:0,zIndex:5}}>
            <div style={{width:INFO_W,flexShrink:0,display:"flex",borderRight:"1px solid #e2e8f0",position:"sticky",left:0,background:"#f8fafc",zIndex:6}}>
              <div style={{width:36,flexShrink:0,padding:"8px 6px",fontSize:8,fontWeight:700,color:"#5a7a9a",textAlign:"center",borderRight:"1px solid #f0f4f8"}}>TIPO</div>
              <div style={{flex:1,padding:"8px 10px",fontSize:8,fontWeight:700,color:"#5a7a9a",letterSpacing:".05em",borderRight:"1px solid #f0f4f8"}}>ACTIVIDAD</div>
              {showResp&&<div style={{width:70,flexShrink:0,padding:"8px 6px",fontSize:8,fontWeight:700,color:"#5a7a9a",textAlign:"center",borderRight:"1px solid #f0f4f8"}}>RESP.</div>}
              <div style={{width:70,flexShrink:0,padding:"8px 6px",fontSize:8,fontWeight:700,color:"#5a7a9a",textAlign:"center",borderRight:"1px solid #f0f4f8"}}>ESTADO</div>
              <div style={{width:56,flexShrink:0,padding:"8px 6px",fontSize:8,fontWeight:700,color:"#5a7a9a",textAlign:"center"}}>F.ENTREGA</div>
            </div>
            {Array.from({length:dias},(_,i)=>{const d=i+1;const dow=new Date(gYear,gMonth,d).getDay();const isW=dow===0||dow===6;const isT=d===todayD;return(<div key={d} style={{flex:1,minWidth:26,textAlign:"center",padding:"4px 1px",background:isT?"#6c5ce7":isW?"#fafafa":"transparent",borderRadius:isT?4:0}}><div style={{fontSize:7,color:isT?"#fff":isW?"#c8d8e8":"#8aaabb",fontWeight:700}}>{DIAS_C[dow]}</div><div style={{fontSize:10,fontWeight:800,color:isT?"#fff":isW?"#b2bec3":"#1a2f4a"}}>{d}</div></div>);})}
          </div>
          {filtered.length===0&&<div style={{padding:"32px",textAlign:"center",color:"#b2bec3",fontSize:12}}>Sin actividades para los filtros seleccionados</div>}
          {filtered.map(req=>{
            const tipo=tipos.find(t=>t.id===req.tipo);const resp=dis.find(d=>d.id===req.responableId);
            const c=STAT_C[req.stat]||"#b2bec3";
            const startD=Math.max(1,getDayInMonth(req.creadoEn?.slice(0,10))||1);
            const endD=Math.min(dias,getDayInMonth(req.deadline)||dias);
            const startPct=((startD-1)/dias)*100;const widthPct=((endD-startD+1)/dias)*100;const span=endD-startD+1;
            const vencida=req.deadline&&hoy>req.deadline&&!["entregado","cancelado"].includes(req.stat);
            const vence7=req.deadline&&!["entregado","cancelado"].includes(req.stat)&&new Date(req.deadline)-new Date(hoy)<=7*86400000&&new Date(req.deadline)>=new Date(hoy);
            const alerta=req.stat==="entregado"?"FINALIZADO":vencida?"VENCIDO":vence7?"PRÓXIMO":"PENDIENTE";
            const alertaC=req.stat==="entregado"?"#00b894":vencida?"#dc2626":vence7?"#f6a623":"#b2bec3";
            return(
              <div key={req.id} style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid #f5f7fa",minHeight:38,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f8fcff"}
                onMouseLeave={e=>e.currentTarget.style.background=""}
                onClick={()=>setSelReq(selReq?.id===req.id?null:req)}>
                <div style={{width:INFO_W,flexShrink:0,display:"flex",alignItems:"center",borderRight:"1px solid #e2e8f0",background:"#fff",position:"sticky",left:0,zIndex:2,boxShadow:"2px 0 4px rgba(0,0,0,.04)"}}>
                  <div style={{width:36,flexShrink:0,textAlign:"center",borderRight:"1px solid #f0f4f8",padding:"0 4px",fontSize:16}}>{tipo?.e||"📌"}</div>
                  <div style={{flex:1,padding:"0 8px",borderRight:"1px solid #f0f4f8",minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.titulo}</div><div style={{fontSize:8,color:"#8aaabb"}}>{req.id}</div></div>
                  {showResp&&<div style={{width:70,flexShrink:0,textAlign:"center",borderRight:"1px solid #f0f4f8",padding:"0 4px"}}>{resp?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><div style={{width:20,height:20,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",fontWeight:700}}>{resp.iniciales||getIniciales(resp.nombre)}</div><span style={{fontSize:7,color:"#5a7a9a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:64}}>{resp.nombre.split(" ")[0]}</span></div>:<span style={{fontSize:9,color:"#b2bec3"}}>—</span>}</div>}
                  <div style={{width:70,flexShrink:0,textAlign:"center",borderRight:"1px solid #f0f4f8",padding:"0 4px"}}><span style={{padding:"2px 5px",borderRadius:20,fontSize:8,fontWeight:700,color:alertaC,background:alertaC+"18"}}>{alerta}</span></div>
                  <div style={{width:56,flexShrink:0,textAlign:"center",padding:"0 4px"}}><span style={{fontSize:9,fontWeight:700,color:vencida?"#e17055":"#5a7a9a"}}>{req.deadline?.slice(5)||"—"}</span></div>
                </div>
                <div style={{flex:1,position:"relative",height:38}}>
                  {Array.from({length:dias},(_,i)=>{const d=i+1;const dow=new Date(gYear,gMonth,d).getDay();return <div key={d} style={{position:"absolute",left:((i)/dias)*100+"%",width:(1/dias)*100+"%",height:"100%",background:d===todayD?"#f0edff":dow===0||dow===6?"#fafafa":"transparent",borderRight:"1px solid #f5f7fa"}}/>;})};
                  {startD<=dias&&endD>=1&&<div style={{position:"absolute",left:startPct+"%",width:widthPct+"%",top:9,height:20,background:c,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",opacity:.9,zIndex:1}}><span style={{fontSize:9,fontWeight:700,color:"#fff",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{req.stat==="retrasado"?"⚠ ":""}{span>=5?req.titulo:span>=3?(req.hReal>0?req.hReal+"h":req.hEst+"h"):""}</span></div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selReq&&(
        <div style={{borderTop:"2px solid #e2e8f0",padding:16,background:"#f8fafc"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:9,color:"#8aaabb",fontWeight:700,letterSpacing:".05em",marginBottom:3}}>{selReq.id} · {tipos.find(t=>t.id===selReq.tipo)?.e||"📌"} {(tipos.find(t=>t.id===selReq.tipo)?.n||selReq.tipo).toUpperCase()} · {selReq.area}</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,color:"#1a2f4a",marginBottom:4}}>{selReq.titulo}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{...S.pill(STAT_C[selReq.stat]||"#b2bec3",(STAT_C[selReq.stat]||"#b2bec3")+"18")}}>{STAT_L[selReq.stat]||selReq.stat}</span>
                <span style={S.pill("#5a7a9a","#f0f4f8")}>Por: {selReq.creadoPor}</span>
                {selReq.prioridad&&<span style={S.pill(selReq.prioridad==="Urgente"?"#dc2626":selReq.prioridad==="Alta"?"#e17055":"#f6a623","#f8fafc")}>🔥 {selReq.prioridad}</span>}
              </div>
            </div>
            <button onClick={()=>setSelReq(null)} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[{label:"INICIO",val:selReq.creadoEn?.slice(0,10)||"—",c:"#5a7a9a"},{label:"DEADLINE",val:selReq.deadline||"—",c:selReq.deadline&&hoy>selReq.deadline?"#e17055":"#5a7a9a"},{label:"HH EST.",val:(selReq.hEst||"—")+"h",c:"#0984e3"},{label:"HH REALES",val:selReq.hReal>0?selReq.hReal+"h":"En proceso",c:selReq.hReal>(parseFloat(selReq.hEst)||99)?"#e17055":"#00b894"}].map(k=>(
              <div key={k.label} style={{background:"#fff",borderRadius:9,padding:"10px 12px",border:"1px solid #e2e8f0"}}><div style={{fontSize:8,color:"#8aaabb",fontWeight:700,marginBottom:3}}>{k.label}</div><div style={{fontSize:14,fontWeight:800,color:k.c}}>{k.val}</div></div>
            ))}
          </div>
          {selReq.objetivo&&<div style={{fontSize:11,color:"#5a7a9a",marginTop:10}}><strong style={{color:"#1a2f4a"}}>Objetivo:</strong> {selReq.objetivo}</div>}
          {selReq.obs&&<div style={{padding:"8px 12px",borderRadius:8,background:"#fff8ec",border:"1px solid #FAC775",fontSize:11,color:"#854F0B",marginTop:8}}><strong>Obs:</strong> {selReq.obs}</div>}
        </div>
      )}
    </div>
  );
}

/* ══ PANEL DISEÑADORES ══════════════════════════════════ */
function DisenaoresPanel({S,dis,config,saveConfig,showNewD,setShowNewD,newDis,setNewDis,showToast}){
  const [editId,setEditId]=useState(null);
  const [editData,setEditData]=useState({});
  const [delId,setDelId]=useState(null);
  const addDis=()=>{
    if(!newDis.nombre.trim())return;
    const ini=getIniciales(newDis.nombre);const c=AV_COLORS[dis.length%AV_COLORS.length];
    saveConfig({...config,disenadores:[...(dis||[]),{id:"d"+Date.now(),nombre:newDis.nombre.trim(),iniciales:ini,color:c,rol:newDis.rol,hSem:parseInt(newDis.hSem)||48,activo:true}]});
    setNewDis({nombre:"",rol:"Diseñador",hSem:48});setShowNewD(false);showToast("✅ Diseñador agregado");
  };
  const startEdit=d=>{setEditId(d.id);setEditData({nombre:d.nombre,rol:d.rol,hSem:d.hSem,color:d.color||"#6c5ce7"});};
  const saveEdit=()=>{
    if(!editData.nombre?.trim())return;
    saveConfig({...config,disenadores:(dis||[]).map(d=>d.id===editId?{...d,nombre:editData.nombre.trim(),iniciales:getIniciales(editData.nombre),rol:editData.rol,hSem:parseInt(editData.hSem)||48,color:editData.color}:d)});
    setEditId(null);showToast("✏️ Actualizado");
  };
  const toggleDis=id=>saveConfig({...config,disenadores:(dis||[]).map(d=>d.id===id?{...d,activo:!d.activo}:d)});
  const confirmDel=()=>{saveConfig({...config,disenadores:dis.filter(d=>d.id!==delId)});setDelId(null);showToast("🗑️ Eliminado");};
  const ROLES=["Senior","Diseñador","Jr","Practicante"];
  const PALETTE=["#6c5ce7","#00b894","#0984e3","#e17055","#f6a623","#a29bfe","#fd79a8","#00b5b4","#d63031","#2d3436"];
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Diseñadores</div><div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>{(dis||[]).filter(d=>d.activo!==false).length} activos de {(dis||[]).length} registrados</div></div>
        <button onClick={()=>setShowNewD(!showNewD)} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>＋ Nuevo</button>
      </div>
      {showNewD&&(
        <div style={{...S.card,padding:16,marginBottom:12,border:"1.5px solid #a29bfe"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,marginBottom:10}}>
            <div><label style={S.lbl}>NOMBRE</label><input value={newDis.nombre} onChange={e=>setNewDis(p=>({...p,nombre:e.target.value}))} style={S.inp}/></div>
            <div><label style={S.lbl}>ROL</label><select value={newDis.rol} onChange={e=>setNewDis(p=>({...p,rol:e.target.value}))} style={{...S.inp,width:"auto"}}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
            <div><label style={S.lbl}>HH/SEM</label><input type="number" value={newDis.hSem} onChange={e=>setNewDis(p=>({...p,hSem:e.target.value}))} style={{...S.inp,width:64}} min="8" step="4"/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setShowNewD(false)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={addDis} style={{padding:"8px 18px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Agregar →</button>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(dis||[]).map(d=>(
          <div key={d.id}>
            {editId===d.id
              ?<div style={{...S.card,padding:16,border:"1.5px solid #6c5ce7"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,marginBottom:10}}>
                  <div><label style={S.lbl}>NOMBRE</label><input value={editData.nombre} onChange={e=>setEditData(p=>({...p,nombre:e.target.value}))} style={S.inp}/></div>
                  <div><label style={S.lbl}>ROL</label><select value={editData.rol} onChange={e=>setEditData(p=>({...p,rol:e.target.value}))} style={{...S.inp,width:"auto"}}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
                  <div><label style={S.lbl}>HH/SEM</label><input type="number" value={editData.hSem} onChange={e=>setEditData(p=>({...p,hSem:e.target.value}))} style={{...S.inp,width:64}} min="8" step="4"/></div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={S.lbl}>COLOR</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {PALETTE.map(c=>(<div key={c} onClick={()=>setEditData(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:editData.color===c?"3px solid #1a2f4a":"3px solid transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{editData.color===c&&<span style={{fontSize:12,color:"#fff",fontWeight:800}}>✓</span>}</div>))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setEditId(null)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>Cancelar</button>
                  <button onClick={saveEdit} style={{padding:"8px 18px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#6c5ce7,#1a2f4a)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Guardar</button>
                </div>
              </div>
              :<div style={{...S.card,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,opacity:d.activo!==false?1:.5}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700,flexShrink:0}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{d.nombre}</div><div style={{fontSize:10,color:"#8aaabb"}}>{d.rol} · {d.hSem}h/sem</div></div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>startEdit(d)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #a29bfe",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️</button>
                  <button onClick={()=>toggleDis(d.id)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid "+(d.activo!==false?"#fecaca":"#bbf7d0"),background:d.activo!==false?"#fff1f2":"#f0fdf4",color:d.activo!==false?"#dc2626":"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}}>{d.activo!==false?"Pausar":"Activar"}</button>
                  <button onClick={()=>setDelId(d.id)} style={{padding:"5px 9px",borderRadius:7,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </div>}
          </div>
        ))}
        {dis.length===0&&<div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12,borderRadius:10,border:"1.5px dashed #e2e8f0"}}>Sin diseñadores</div>}
      </div>
      {delId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:6}}>¿Eliminar diseñador?</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:6}}>{(dis||[]).find(d=>d.id===delId)?.nombre}</div>
            <div style={{padding:"8px 12px",borderRadius:8,background:"#fff1f2",border:"1px solid #fecaca",fontSize:11,color:"#dc2626",marginBottom:18}}>Los trabajos asignados quedarán sin responsable.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDelId(null)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:13}}>Cancelar</button>
              <button onClick={confirmDel} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#dc2626,#991b1b)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ══ TAB USUARIOS ═══════════════════════════════════════ */
function TabUsuarios({S,showToast}){
  const [usuarios,setUsuarios]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({nombre:"",dni:"",rol:"disenador",email:"",area:"Trade Marketing",telefono:""});
  const [saving,setSaving]=useState(false);
  const [search,setSearch]=useState("");
  const [editUserId,setEditUserId]=useState(null);
  const [editUserData,setEditUserData]=useState({nombre:"",dni:"",email:"",area:"",telefono:""});
  const ROLES_U=["admin","disenador","viewer"];
  const ROL_META={
    admin:   {emoji:"🪪", label:"Admin",       color:"#f6a623", bg:"#fff8ec"},
    disenador:{emoji:"🎨", label:"Team Diseño", color:"#6c5ce7", bg:"#f0eeff"},
    viewer:  {emoji:"🔵", label:"Visor",        color:"#0984e3", bg:"#e8f4fd"},
  };
  const ROL_ICON={
    admin:    <svg width="14" height="14" viewBox="0 0 110 100" xmlns="http://www.w3.org/2000/svg" style={{display:"inline-block",verticalAlign:"middle",marginRight:4}}><rect x="2" y="8" width="82" height="72" rx="6" fill="#E3F2F9"/><rect x="2" y="8" width="40" height="72" rx="0" fill="#CFE9F5"/><rect x="37" y="4" width="10" height="14" rx="3" fill="#FFC107"/><circle cx="22" cy="36" r="11" fill="#F4A896"/><path d="M8 70 Q8 52 22 52 Q36 52 36 70" fill="#7C6BC0"/><rect x="48" y="28" width="28" height="6" rx="3" fill="#6B5EA8"/><rect x="48" y="42" width="22" height="6" rx="3" fill="#6B5EA8"/><circle cx="88" cy="76" r="20" fill="#4CAF50"/><polyline points="78,76 85,84 100,66" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    disenador:<svg width="14" height="14" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{display:"inline-block",verticalAlign:"middle",marginRight:4}}><circle cx="50" cy="50" r="36" fill="none" stroke="#E0E0E0" strokeWidth="20"/><path d="M50 14 A36 36 0 0 1 86 50" fill="none" stroke="#81C784" strokeWidth="20"/><path d="M86 50 A36 36 0 0 1 68 82" fill="none" stroke="#FFB74D" strokeWidth="20"/><path d="M68 82 A36 36 0 0 1 32 82" fill="none" stroke="#F06292" strokeWidth="20"/><path d="M32 82 A36 36 0 0 1 14 50" fill="none" stroke="#64B5F6" strokeWidth="20"/><path d="M14 50 A36 36 0 0 1 50 14" fill="none" stroke="#AED581" strokeWidth="20"/><circle cx="50" cy="50" r="18" fill="white"/><line x1="30" y1="75" x2="62" y2="30" stroke="#1565C0" strokeWidth="6" strokeLinecap="round"/><polygon points="62,22 70,38 54,38" fill="#1565C0"/></svg>,
    viewer:   <svg width="14" height="14" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{display:"inline-block",verticalAlign:"middle",marginRight:4}}><circle cx="50" cy="50" r="20" fill="#5B7FD4"/><circle cx="50" cy="50" r="20" fill="url(#vg)"/><defs><linearGradient id="vg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#64B5F6"/><stop offset="100%" stopColor="#4A6FD4"/></linearGradient></defs><circle cx="50" cy="42" r="8" fill="#E8EEF8"/><ellipse cx="50" cy="58" rx="10" ry="7" fill="#E8EEF8"/><circle cx="50" cy="8" r="8" fill="#64B5F6"/><circle cx="50" cy="92" r="8" fill="#64B5F6"/><circle cx="12" cy="50" r="8" fill="#64B5F6"/><circle cx="88" cy="50" r="8" fill="#64B5F6"/><circle cx="24" cy="24" r="7" fill="#90CAF9"/><circle cx="76" cy="24" r="7" fill="#90CAF9"/><circle cx="24" cy="76" r="7" fill="#90CAF9"/><circle cx="76" cy="76" r="7" fill="#90CAF9"/><line x1="50" y1="30" x2="50" y2="16" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="50" y1="70" x2="50" y2="84" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="30" y1="50" x2="18" y2="50" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="70" y1="50" x2="82" y2="50" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="36" y1="36" x2="28" y2="28" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="64" y1="36" x2="72" y2="28" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="36" y1="64" x2="28" y2="72" stroke="#B0C4DE" strokeWidth="2.5"/><line x1="64" y1="64" x2="72" y2="72" stroke="#B0C4DE" strokeWidth="2.5"/></svg>,
  };
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"trade_users"),snap=>{
      const arr=[];
      snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      arr.sort((a,b)=>{if(a.activo!==b.activo)return b.activo?1:-1;return a.nombre.localeCompare(b.nombre);});
      setUsuarios(arr);
    });
    return()=>unsub();
  },[]);
  const handleGuardar=async()=>{
    if(!form.nombre.trim()||!form.dni.trim()){showToast("⚠ Completa nombre y DNI");return;}
    if(usuarios.find(u=>u.nombre.toLowerCase()===form.nombre.trim().toLowerCase())){showToast("⚠ Ya existe ese nombre");return;}
    setSaving(true);
    try{
      await addDoc(collection(db,"trade_users"),{nombre:form.nombre.trim(),dni:form.dni.trim(),rol:form.rol,email:form.email.trim(),area:form.area,telefono:form.telefono.trim(),activo:true});
      setForm({nombre:"",dni:"",rol:"disenador",email:"",area:"Trade Marketing",telefono:""});setShowForm(false);showToast("✅ Usuario creado");
    }catch{showToast("❌ Error al guardar");}
    setSaving(false);
  };
  const handleCambiarRol=async(id,rol)=>{
    try{await updateDoc(doc(db,"trade_users",id),{rol});showToast("✅ Rol actualizado");}
    catch{showToast("❌ Error");}
  };
  const handleToggle=async(id,activo)=>{
    try{await updateDoc(doc(db,"trade_users",id),{activo:!activo});showToast(activo?"⏸ Desactivado":"✅ Activado");}
    catch{showToast("❌ Error");}
  };
  const handleGuardarEdit=async(id)=>{
    if(!editUserData.nombre.trim()||!editUserData.dni.trim()){showToast("⚠ Completa nombre y DNI");return;}
    try{await updateDoc(doc(db,"trade_users",id),{nombre:editUserData.nombre.trim(),dni:editUserData.dni.trim(),email:(editUserData.email||"").trim(),area:editUserData.area||"",telefono:(editUserData.telefono||"").trim()});setEditUserId(null);showToast("✅ Usuario actualizado");}
    catch{showToast("❌ Error al actualizar");}
  };
  const filtrados=usuarios.filter(u=>u.nombre.toLowerCase().includes(search.toLowerCase())||(u.rol||"").toLowerCase().includes(search.toLowerCase()));
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Gestión de usuarios</div>
          <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>{usuarios.filter(u=>u.activo).length} activos · {usuarios.length} totales</div>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>{showForm?"✕ Cancelar":"+ Nuevo usuario"}</button>
      </div>
      {showForm&&(
        <div style={{...S.card,padding:18,marginBottom:16,border:"1.5px solid #a29bfe"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={S.lbl}>NOMBRE COMPLETO</label><input style={S.inp} placeholder="Ej: María Castillo" value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/></div>
            <div><label style={S.lbl}>DNI <span style={{fontSize:9,color:"#8aaabb"}}>(credencial de ingreso)</span></label><input style={S.inp} placeholder="12345678" value={form.dni} onChange={e=>setForm(p=>({...p,dni:e.target.value}))}/></div>
            <div><label style={S.lbl}>EMAIL CORPORATIVO</label><input style={S.inp} placeholder="usuario@grupovega.pe" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
            <div><label style={S.lbl}>ÁREA</label>
              <select style={S.inp} value={form.area} onChange={e=>setForm(p=>({...p,area:e.target.value}))}>
                {["Trade Marketing","Marketing","Marketing Digital","Ecommerce","Servicio al Cliente","Comercial","Operaciones","Gerencia","Otra"].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>TELÉFONO WHATSAPP <span style={{fontSize:9,color:"#8aaabb"}}>(+51 9XX XXX XXX)</span></label><input style={S.inp} placeholder="+51 999 888 777" value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))}/></div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={S.lbl}>ROL</label>
            <div style={{display:"flex",gap:8}}>
              {ROLES_U.map(r=>{const m=ROL_META[r];return(
                <button key={r} onClick={()=>setForm(p=>({...p,rol:r}))}
                  style={{flex:1,padding:"10px 14px",borderRadius:9,border:"1.5px solid "+(form.rol===r?m.color:"#e2e8f0"),background:form.rol===r?m.bg:"#fff",color:form.rol===r?m.color:"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  {ROL_ICON[r]}{m.label}
                </button>
              );})}
            </div>
          </div>
          <button onClick={handleGuardar} disabled={saving} style={{padding:"9px 18px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,opacity:saving?.7:1}}>
            {saving?"Guardando...":"Crear usuario"}
          </button>
        </div>
      )}
      <input style={{...S.inp,marginBottom:12}} placeholder="🔍 Buscar usuario..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(u=>{
          const meta=ROL_META[u.rol]||ROL_META.viewer;
          return(
            <div key={u.id} style={{...S.card,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:u.activo?1:.5}}>
              <div style={{width:40,height:40,borderRadius:10,background:meta.bg,border:"1.5px solid "+meta.color+"30",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:meta.color,flexShrink:0}}>{getIniciales(u.nombre)}</div>
              {editUserId===u.id
                ?<div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,alignItems:"center"}}>
                  <input value={editUserData.nombre} onChange={e=>setEditUserData(p=>({...p,nombre:e.target.value}))} style={{...S.inp,padding:"6px 10px",fontSize:11}} placeholder="Nombre completo"/>
                  <input value={editUserData.dni} onChange={e=>setEditUserData(p=>({...p,dni:e.target.value}))} style={{...S.inp,padding:"6px 10px",fontSize:11}} placeholder="DNI"/>
                  <input value={editUserData.email||""} onChange={e=>setEditUserData(p=>({...p,email:e.target.value}))} style={{...S.inp,padding:"6px 10px",fontSize:11}} placeholder="email@grupovega.pe"/>
                  <select value={editUserData.area||"Trade Marketing"} onChange={e=>setEditUserData(p=>({...p,area:e.target.value}))} style={{...S.inp,padding:"6px 10px",fontSize:11}}>
                    {["Trade Marketing","Marketing","Marketing Digital","Ecommerce","Servicio al Cliente","Comercial","Operaciones","Gerencia","Otra"].map(a=><option key={a}>{a}</option>)}
                  </select>
                  <input value={editUserData.telefono||""} onChange={e=>setEditUserData(p=>({...p,telefono:e.target.value}))} style={{...S.inp,padding:"6px 10px",fontSize:11}} placeholder="+51 999 888 777"/>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>handleGuardarEdit(u.id)} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:11}}>✓ Guardar</button>
                    <button onClick={()=>setEditUserId(null)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                </div>
                :<div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.nombre}</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:3}}>
                    <span style={{fontSize:10,color:"#8aaabb"}}>DNI: {"•".repeat(4)+u.dni.slice(-3)}</span>
                    {u.email&&<span style={{fontSize:10,color:"#0984e3",overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{u.email}</span>}
                    {u.area&&<span style={{fontSize:10,color:"#6c5ce7",background:"#f0edff",padding:"1px 6px",borderRadius:8}}>{u.area}</span>}
                    {u.telefono&&<span style={{fontSize:10,color:"#00b894"}}>{u.telefono}</span>}
                  </div>
                </div>}
              {editUserId!==u.id&&<>
                <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                  <div style={{position:"absolute",left:8,zIndex:1,pointerEvents:"none",display:"flex",alignItems:"center"}}>
                    {ROL_ICON[u.rol]||ROL_ICON.viewer}
                  </div>
                  <select value={u.rol} onChange={e=>handleCambiarRol(u.id,e.target.value)}
                    style={{paddingLeft:26,paddingRight:10,paddingTop:6,paddingBottom:6,borderRadius:8,border:"1.5px solid "+meta.color+"40",background:meta.bg,color:meta.color,fontWeight:700,fontSize:11,cursor:"pointer",outline:"none"}}>
                    {ROLES_U.map(r=><option key={r} value={r}>{ROL_META[r].label}</option>)}
                  </select>
                </div>
                <button onClick={()=>{setEditUserId(u.id);setEditUserData({nombre:u.nombre,dni:u.dni,email:u.email||"",area:u.area||"Trade Marketing",telefono:u.telefono||""});}}
                  style={{padding:"6px 10px",borderRadius:8,border:"1px solid #a29bfe",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontWeight:700,fontSize:11}}>✏️</button>
                <button onClick={()=>handleToggle(u.id,u.activo)}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(u.activo?"#fecaca":"#bbf7d0"),background:u.activo?"#fff1f2":"#f0fdf4",color:u.activo?"#dc2626":"#16a34a",cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                  {u.activo?"Pausar":"Activar"}
                </button>
              </>}
            </div>
          );
        })}
        {filtrados.length===0&&<div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12,borderRadius:10,border:"1.5px dashed #e2e8f0"}}>{search?"Sin resultados":"Sin usuarios registrados"}</div>}
      </div>
    </div>
  );
}

/* ══ TAB CONFIG — SIN TAB USUARIOS ═════════════════════ */
function TabConfig({S,config,setConfig,saveConfig,cfgTab,setCfgTab,newTipo,setNewTipo,newDis,setNewDis,showNewT,setShowNewT,showNewD,setShowNewD,showToast}){
  /* 4 tabs: Tipos · Diseñadores · Áreas · Usuarios */
  const tabs=["📦 Tipos de trabajo","📐 Áreas",<span style={{display:"flex",alignItems:"center",gap:4}}><svg width="16" height="16" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{display:"inline-block",verticalAlign:"middle",marginRight:5}}><circle cx="42" cy="32" r="22" fill="#3D5A9E"/><path d="M4 88 Q4 60 42 60 Q80 60 80 88" fill="#3D5A9E"/><circle cx="75" cy="30" r="22" fill="#64D6F5"/><polyline points="63,30 71,39 88,20" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg>Usuarios</span>];
  const tipos=config.tipos||[];
   const dis=[];
  const areas=config.areas||AREAS_DEFAULT;
  const [newArea,setNewArea]=useState("");
  const [editArea,setEditArea]=useState(null);

  const addTipo=()=>{
    if(!newTipo.n.trim())return;
    saveConfig({...config,tipos:[...tipos,{id:"t"+Date.now(),n:newTipo.n.trim(),e:newTipo.e||"📌",hEst:parseFloat(newTipo.hEst)||2,activo:true}]});
    setNewTipo({n:"",e:"📌",hEst:2});setShowNewT(false);showToast("✅ Tipo agregado");
  };
  const toggleTipo=id=>saveConfig({...config,tipos:tipos.map(x=>x.id===id?{...x,activo:!x.activo}:x)});
  const addArea=()=>{if(!newArea.trim())return;saveConfig({...config,areas:[...areas,newArea.trim()]});setNewArea("");showToast("✅ Área agregada");};
  const removeArea=a=>saveConfig({...config,areas:areas.filter(x=>x!==a)});
  const saveEditArea=()=>{
    if(!editArea||!editArea.val.trim()){setEditArea(null);return;}
    const newAreas=[...areas];newAreas[editArea.idx]=editArea.val.trim();
    saveConfig({...config,areas:newAreas});setEditArea(null);showToast("✅ Área actualizada");
  };

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {tabs.map((l,i)=>(
          <button key={i} onClick={()=>setCfgTab(i)}
            style={{padding:"9px 16px",borderRadius:10,border:"1.5px solid "+(cfgTab===i?"#6c5ce7":"#e2e8f0"),background:cfgTab===i?"#1a2f4a":"#fff",color:cfgTab===i?"#fff":"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:12}}>
            {l}
          </button>
        ))}
      </div>

      {cfgTab===0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Tipos de trabajo</div><div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>Disponibles en el brief · HH estimadas base</div></div>
            <button onClick={()=>setShowNewT(!showNewT)} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>＋ Nuevo tipo</button>
          </div>
          {showNewT&&(
            <div style={{...S.card,padding:14,marginBottom:12,border:"1.5px solid #a29bfe"}}>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:8,alignItems:"end"}}>
                <div><label style={S.lbl}>EMOJI</label><input value={newTipo.e} onChange={e=>setNewTipo(p=>({...p,e:e.target.value}))} style={{...S.inp,width:50,textAlign:"center",fontSize:18}}/></div>
                <div><label style={S.lbl}>NOMBRE</label><input value={newTipo.n} onChange={e=>setNewTipo(p=>({...p,n:e.target.value}))} placeholder="Ej: Infografía" style={S.inp}/></div>
                <div><label style={S.lbl}>HH EST.</label><input type="number" value={newTipo.hEst} onChange={e=>setNewTipo(p=>({...p,hEst:e.target.value}))} style={{...S.inp,width:64}} min=".5" step=".5"/></div>
                <button onClick={addTipo} style={{padding:"10px 16px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,alignSelf:"flex-end"}}>Agregar</button>
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
            {tipos.map(t=>(
              <div key={t.id} style={{...S.card,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,opacity:t.activo!==false?1:.5}}>
                <span style={{fontSize:18}}>{t.e}</span>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{t.n}</div><div style={{fontSize:10,color:"#8aaabb"}}>HH est: {t.hEst}h</div></div>
                <button onClick={()=>toggleTipo(t.id)} style={{padding:"4px 10px",borderRadius:7,border:"1px solid "+(t.activo!==false?"#fecaca":"#bbf7d0"),background:t.activo!==false?"#fff1f2":"#f0fdf4",color:t.activo!==false?"#dc2626":"#16a34a",cursor:"pointer",fontSize:10,fontWeight:700}}>{t.activo!==false?"Ocultar":"Activar"}</button>
              </div>
            ))}
          </div>
        </div>
      )}


      {cfgTab===2&&<TabUsuarios S={S} showToast={showToast}/>}

      {cfgTab===1&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Áreas solicitantes</div><div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>{areas.length} registradas</div></div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={newArea} onChange={e=>setNewArea(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addArea()} placeholder="Nueva área..." style={{...S.inp,flex:1}}/>
            <button onClick={addArea} style={{padding:"10px 16px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>＋</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {areas.map((a,idx)=>(
              <div key={idx} style={{...S.card,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:9,background:"#e8f4fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📐</div>
                {editArea?.idx===idx
                  ?<input autoFocus value={editArea.val} onChange={e=>setEditArea({idx,val:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")saveEditArea();if(e.key==="Escape")setEditArea(null);}} style={{...S.inp,flex:1,padding:"6px 10px"}}/>
                  :<span style={{flex:1,fontWeight:600,fontSize:13,color:"#1a2f4a"}}>{a}</span>}
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  {editArea?.idx===idx
                    ?<><button onClick={saveEditArea} style={{padding:"5px 10px",borderRadius:7,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>✓</button><button onClick={()=>setEditArea(null)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:11}}>✕</button></>
                    :<><button onClick={()=>setEditArea({idx,val:a})} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #a29bfe",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:12}}>✏️</button><button onClick={()=>removeArea(a)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:12}}>🗑️</button></>}
                </div>
              </div>
            ))}
            {areas.length===0&&<div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12,borderRadius:10,border:"1.5px dashed #e2e8f0"}}>Sin áreas</div>}
          </div>
        </div>
      )}
    </div>
  );
}
