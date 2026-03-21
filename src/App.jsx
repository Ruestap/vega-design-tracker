import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";

/* ══ CONSTANTES ══════════════════════════════════════════ */
const MESES_N = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_C  = ["D","L","M","X","J","V","S"];
const AV_COLORS = ["#6c5ce7","#00b894","#0984e3","#e17055","#f6a623","#a29bfe","#fd79a8","#00b5b4"];

const TIPOS_DEFAULT = [
  {id:"catalogo",   n:"Catálogo",        e:"📒", hEst:8,   activo:true},
  {id:"pop",        n:"Material POP",    e:"🎯", hEst:3,   activo:true},
  {id:"digital",    n:"Digital / RRSS",  e:"📱", hEst:2,   activo:true},
  {id:"volante",    n:"Volante / Afiche",e:"📄", hEst:2.5, activo:true},
  {id:"marcador",   n:"Marcador Precio", e:"🏷️", hEst:1.5, activo:true},
  {id:"gondola",    n:"Góndola / Exhibidor",e:"🏗️",hEst:4, activo:true},
  {id:"creativo",   n:"Creativo (brief)",e:"⭐", hEst:10,  activo:true},
];

const DISENADORES_DEFAULT = [
  {id:"d1", nombre:"María Castillo", iniciales:"MC", color:"#6c5ce7", rol:"Senior",    hSem:48, activo:true},
  {id:"d2", nombre:"Juan Pérez",     iniciales:"JP", color:"#00b894", rol:"Diseñador", hSem:48, activo:true},
  {id:"d3", nombre:"Sofía Ríos",     iniciales:"SR", color:"#0984e3", rol:"Jr",        hSem:48, activo:true},
];

const AREAS_DEFAULT = ["Trade Marketing","Comercial","Marketing","Operaciones","Gerencia","Otra"];
const TONOS = ["Corporativo","Emocional","Promocional","Divertido","Impactante"];
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
  pendiente:"Brief recibido", en_diseno:"En diseño",
  aprobacion:"En aprobación", entregado:"Entregado ✓",
  retrasado:"Retrasado ⚠", cancelado:"Cancelado",
};

const SESSION_KEY = "vega_trade_session";

/* ══ UTILS ══════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().slice(0,10);
const getDow   = s => new Date(s+"T12:00:00").getDay();
const esFS     = s => {const d=getDow(s); return d===0||d===6;};
const sc = v=>{ if(!v&&v!==0)return"#b2bec3"; if(v>=90)return"#00b894"; if(v>=70)return"#f6a623"; if(v>=50)return"#e17055"; return"#d63031"; };
const sb = v=>{ if(!v&&v!==0)return"#f4f6f8"; if(v>=90)return"#e8faf5"; if(v>=70)return"#fff8ec"; if(v>=50)return"#fff1ee"; return"#ffeae6"; };

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

/* ══ APP PRINCIPAL ══════════════════════════════════════ */
export default function TradeApp() {
  const now = new Date();

  /* ── auth — cargamos sesión guardada en localStorage ── */
  const [usuario, setUsuario] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  /* Persistimos la sesión cada vez que cambia */
  useEffect(() => {
    if (usuario) localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
    else         localStorage.removeItem(SESSION_KEY);
  }, [usuario]);

  /* ── nav ── */
  const [tab,     setTab]     = useState(0);
  /* ── data Firebase ── */
  const [solicitudes, setSolicitudes] = useState([]);
  const [config,      setConfig]      = useState({
    tipos:       TIPOS_DEFAULT,
    disenadores: DISENADORES_DEFAULT,
    areas:       AREAS_DEFAULT,
  });
  /* ── filtros solicitudes ── */
  const [fStat, setFStat] = useState("Todos");
  const [fTipo, setFTipo] = useState("Todos");
  const [fResp, setFResp] = useState("Todos");
  const [busq,  setBusq]  = useState("");
  /* ── Gantt ── */
  const [gYear,  setGYear]  = useState(now.getFullYear());
  const [gMonth, setGMonth] = useState(now.getMonth());
  const [gFiltResp, setGFiltResp] = useState("");
  const [gFiltTipo, setGFiltTipo] = useState("");
  const [gFiltStat, setGFiltStat] = useState("");
  const [selReq, setSelReq] = useState(null);
  const [dashLvl, setDashLvl] = useState(1);
  /* ── brief modal ── */
  const [briefModal, setBriefModal] = useState(false);
  const [briefEdit,  setBriefEdit]  = useState(null);
  const [brief, setBrief] = useState(emptyBrief());
  /* ── toast ── */
  const [toast, setToast] = useState("");
  const toastRef = useRef();
  /* ── cfg tabs ── */
  const [cfgTab, setCfgTab] = useState(0);
  const [newTipo,    setNewTipo]    = useState({n:"",e:"📌",hEst:2});
  const [newDis,     setNewDis]     = useState({nombre:"",rol:"Diseñador",hSem:48});
  const [showNewT,   setShowNewT]   = useState(false);
  const [showNewD,   setShowNewD]   = useState(false);

  /* ── Firebase listeners ── */
  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"trade_solicitudes"), snap=>{
      const arr=[];
      snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      arr.sort((a,b)=>new Date(b.creadoEn||0)-new Date(a.creadoEn||0));
      setSolicitudes(arr);
    });
    return ()=>unsub();
  },[]);

  useEffect(()=>{
    const unsub = onSnapshot(doc(db,"trade_config","app"), snap=>{
      if(snap.exists()){
        const d=snap.data();
        setConfig(c=>({...c,...d}));
      }
    });
    return ()=>unsub();
  },[]);

  const saveConfig = useCallback(async (overrides={})=>{
    const newCfg={...config,...overrides};
    await setDoc(doc(db,"trade_config","app"),{...newCfg, updatedAt:new Date().toISOString()});
  },[config]);

  const showToast = msg=>{
    setToast(msg);
    if(toastRef.current)clearTimeout(toastRef.current);
    toastRef.current=setTimeout(()=>setToast(""),2500);
  };

  /* ── LOGIN: usuario de prueba + Firestore ── */
  // Usuario de prueba para desarrollo y demo — eliminar o cambiar en producción.
  // Para ingresar: nombre "Administrador", DNI "trade2026"
  const USUARIO_PRUEBA = { nombre:"Administrador", dni:"trade2026", rol:"admin" };

  const handleLogin = useCallback(async (nombreInput, dniInput) => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const nombre = nombreInput.trim();
      const dni    = dniInput.trim();
      if(!nombre||!dni){
        setLoginError("Por favor ingresa tu nombre y DNI.");
        setLoginLoading(false);
        return;
      }

      // Verificamos primero el usuario de prueba hardcodeado.
      // Esto permite entrar sin depender de Firestore durante desarrollo.
      if(nombre===USUARIO_PRUEBA.nombre && dni===USUARIO_PRUEBA.dni){
        setUsuario({
          id:        "prueba-admin",
          nombre:    USUARIO_PRUEBA.nombre,
          rol:       USUARIO_PRUEBA.rol,
          iniciales: getIniciales(USUARIO_PRUEBA.nombre),
        });
        setLoginLoading(false);
        return;
      }

      // Si no coincide con el usuario de prueba, busca en Firestore.
      // Aquí irán todos los usuarios reales del equipo.
      const q = query(
        collection(db,"trade_users"),
        where("nombre","==",nombre),
        where("dni","==",dni),
        where("activo","==",true)
      );
      const snap = await getDocs(q);
      if(snap.empty){
        setLoginError("Nombre o DNI incorrecto, o cuenta inactiva.");
        setLoginLoading(false);
        return;
      }
      const docData = snap.docs[0].data();
      setUsuario({
        id:        snap.docs[0].id,
        nombre:    docData.nombre,
        rol:       docData.rol,
        iniciales: getIniciales(docData.nombre),
      });
    } catch(err){
      console.error(err);
      setLoginError("Error de conexión. Intenta de nuevo.");
    }
    setLoginLoading(false);
  },[]);

  const handleLogout = useCallback(()=>{ setUsuario(null); },[]);

  function emptyBrief(){
    return {
      titulo:"", area:"Trade Marketing", solicitante:"", prioridad:"Normal",
      tipo:"", deadline:"", hEst:"", objetivo:"", publico:"", mensaje:"",
      mecanica:"", materiales:[], medidas:"", tono:"", restricciones:"",
      comentarios:"", recursos:"", productosInvolucrados:"",
    };
  }

  /* ── Guardar solicitud ── */
  const guardarSolicitud = async ()=>{
    if(!brief.titulo||!brief.tipo||!brief.deadline){
      showToast("⚠ Completa título, tipo y deadline");
      return;
    }
    const id = briefEdit || "REQ-"+Date.now();
    const now2=new Date().toISOString();
    const data={
      ...brief,
      id,
      stat: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.stat||"pendiente") : "pendiente",
      creadoEn: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.creadoEn||now2) : now2,
      creadoPor: usuario?.nombre||"",
      updatedAt: now2,
      responableId: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.responableId||null) : null,
      hReal: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.hReal||0) : 0,
      tsAsignado: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.tsAsignado||null) : null,
      tsListo: null, tsEntregado: null,
      obs: briefEdit ? (solicitudes.find(s=>s.id===briefEdit)?.obs||"") : "",
    };
    await setDoc(doc(db,"trade_solicitudes",id), data);
    showToast(briefEdit?"✏️ Solicitud actualizada":"✅ Solicitud creada");
    setBriefModal(false); setBriefEdit(null); setBrief(emptyBrief());
  };

  /* ── Acciones de estado ── */
  const asignarDis = async (reqId, disId)=>{
    const req=solicitudes.find(s=>s.id===reqId); if(!req)return;
    const dis=config.disenadores.find(d=>d.id===disId);
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req, responableId:disId, responableNombre:dis?.nombre||disId,
      stat:"en_diseno", tsAsignado:new Date().toISOString(), updatedAt:new Date().toISOString(),
    });
    showToast(`📌 Asignado a ${dis?.nombre||disId}`);
  };

  const marcarListo = async (reqId)=>{
    const req=solicitudes.find(s=>s.id===reqId); if(!req)return;
    const ts=new Date().toISOString();
    const hR=calcHH(req.tsAsignado, ts);
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req, stat:"aprobacion", tsListo:ts, hReal:hR, updatedAt:ts,
    });
    showToast("🎨 Marcado como listo para revisión");
  };

  const aprobarEntrega = async (reqId)=>{
    const req=solicitudes.find(s=>s.id===reqId); if(!req)return;
    const ts=new Date().toISOString();
    const hoy=todayStr(); const dl=req.deadline;
    const aT=hoy<=dl;
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req, stat:aT?"entregado":"retrasado", tsEntregado:ts, aTiempo:aT, updatedAt:ts,
    });
    showToast(aT?"✅ Entregado a tiempo 🎉":"⚠️ Entregado con retraso");
  };

  const rechazarEntrega = async (reqId, motivo)=>{
    const req=solicitudes.find(s=>s.id===reqId); if(!req)return;
    await setDoc(doc(db,"trade_solicitudes",reqId),{
      ...req, stat:"en_diseno", tsListo:null,
      obs:(req.obs||"")+(motivo?`\n[RECHAZADO: ${motivo}]`:""), updatedAt:new Date().toISOString(),
    });
    showToast("↩ Enviado de vuelta a diseño");
  };

  const eliminarSolicitud = async (reqId)=>{
    await deleteDoc(doc(db,"trade_solicitudes",reqId));
    showToast("🗑️ Solicitud eliminada");
  };

  /* ── Computed ── */
  const role        = usuario?.rol || null;
  const uName       = usuario?.nombre || "";
  const uId         = usuario?.id || "";
  const isAdmin     = role==="admin";
  const isDisenador = role==="disenador";
  const canCreate   = role==="admin";  // solo admin crea solicitudes

  /* Filtro de solicitudes: diseñador solo ve las suyas */
  const solFilt = useMemo(()=>{
    return solicitudes.filter(s=>{
      if(fStat!=="Todos"&&s.stat!==fStat) return false;
      if(fTipo!=="Todos"&&s.tipo!==fTipo) return false;
      if(fResp!=="Todos"&&s.responableId!==fResp) return false;
      if(busq&&!s.titulo.toLowerCase().includes(busq.toLowerCase())) return false;
      // Diseñador solo ve trabajos donde su NOMBRE coincide con responableNombre
      if(isDisenador&&s.responableNombre!==uName) return false;
      return true;
    });
  },[solicitudes,fStat,fTipo,fResp,busq,isDisenador,uName]);

  const kpis = useMemo(()=>{
    const src = isDisenador
      ? solicitudes.filter(s=>s.responableNombre===uName)
      : solicitudes;
    const total=src.length;
    const ok=src.filter(s=>s.stat==="entregado").length;
    const delay=src.filter(s=>s.stat==="retrasado").length;
    const active=src.filter(s=>["en_diseno","aprobacion"].includes(s.stat)).length;
    const pend=src.filter(s=>s.stat==="pendiente").length;
    const efic=total>0?Math.round(((ok)/(ok+delay||1))*100):0;
    const hTotEst=src.reduce((a,s)=>a+(parseFloat(s.hEst)||0),0);
    const hTotReal=src.reduce((a,s)=>a+(s.hReal||0),0);
    return{total,ok,delay,active,pend,efic,hTotEst:Math.round(hTotEst*10)/10,hTotReal:Math.round(hTotReal*10)/10};
  },[solicitudes,isDisenador,uName]);

  /* ── ESTILOS BASE ── */
  const S={
    wrap: {fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f0f4f8",minHeight:"100vh",color:"#1a2f4a"},
    card: {background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",boxShadow:"0 2px 8px rgba(0,0,0,.05)"},
    inp:  {width:"100%",padding:"10px 13px",borderRadius:10,border:"1px solid #c8d8e8",background:"#f8fafc",color:"#1a2f4a",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
    lbl:  {fontSize:10,fontWeight:700,color:"#5a7a9a",letterSpacing:".05em",display:"block",marginBottom:5},
    pill: (c,bg)=>({padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:bg,display:"inline-flex",alignItems:"center"}),
    tabB: (on,c="#00b5b4")=>({padding:"9px 16px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,borderBottom:on?`3px solid ${c}`:"3px solid transparent",color:on?c:"#8aaabb",background:"transparent",whiteSpace:"nowrap"}),
    btn:  (c)=>({padding:"11px 18px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${c},#1a2f4a)`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}),
    btnO: (c)=>({padding:"8px 14px",borderRadius:9,border:`1.5px solid ${c}`,background:c+"18",color:c,fontSize:12,fontWeight:700,cursor:"pointer"}),
  };

  /* ══ GUARD: si no hay sesión, mostramos solo el login ══ */
  if(!usuario){
    return(
      <LoginScreen
        onLogin={handleLogin}
        loginError={loginError}
        loginLoading={loginLoading}
      />
    );
  }

  /* ══ TABS según rol ══ */
  const tabsConfig = isAdmin
    ? [
        {i:0,label:"📋 Solicitudes"},
        {i:1,label:"📝 Nueva solicitud"},
        {i:2,label:"🎨 Kanban"},
        {i:3,label:"📊 Dashboard"},
        {i:4,label:"⚙️ Config"},
      ]
    : isDisenador
    ? [
        {i:0,label:"📋 Mis trabajos"},
        {i:2,label:"🎨 Kanban"},
        {i:3,label:"📊 Dashboard"},
      ]
    : /* viewer */
      [{i:3,label:"📊 Dashboard"}];

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:"#1a2f4a",padding:"11px 18px 0",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#6c5ce7,#1a2f4a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🎨</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#fff"}}>VEGA · DESIGN TRACKER</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",letterSpacing:".06em"}}>GESTIÓN DE DISEÑO Y PRODUCCIÓN</div>
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
            {canCreate&&<button onClick={()=>{setBriefEdit(null);setBrief(emptyBrief());setBriefModal(true);setTab(1);}}
              style={{padding:"5px 12px",borderRadius:8,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>＋ Nueva solicitud</button>}
            {/* Badge de usuario con rol */}
            <div style={{padding:"4px 10px",borderRadius:20,background:"rgba(108,92,231,.25)",border:"1px solid rgba(108,92,231,.4)",fontSize:9,color:"#a29bfe",fontWeight:700}}>
              {role==="admin"?"👑":role==="disenador"?"🎨":"👁️"} {uName}
            </div>
            {/* Botón logout */}
            <button onClick={handleLogout}
              style={{padding:"5px 9px",borderRadius:7,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:10,fontWeight:700}}
              title="Cerrar sesión">↩</button>
          </div>
        </div>
        {/* Tabs filtrados por rol */}
        <div style={{display:"flex",gap:0,overflowX:"auto"}}>
          {tabsConfig.map((t,idx)=>(
            <button key={t.i} onClick={()=>setTab(t.i)}
              style={S.tabB(tab===t.i,"#a29bfe")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 18px"}}>
        {tab===0&&<TabSolicitudes S={S} solicitudes={solFilt} kpis={kpis} config={config} fStat={fStat} setFStat={setFStat} fTipo={fTipo} setFTipo={setFTipo} fResp={fResp} setFResp={setFResp} busq={busq} setBusq={setBusq} isAdmin={isAdmin} isDisenador={isDisenador} asignarDis={asignarDis} aprobarEntrega={aprobarEntrega} rechazarEntrega={rechazarEntrega} eliminarSolicitud={eliminarSolicitud} setBriefEdit={setBriefEdit} setBrief={setBrief} setBriefModal={setBriefModal} setTab={setTab} showToast={showToast} uId={uId} uName={uName}/>}
        {tab===1&&isAdmin&&<TabBrief S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} isAdmin={isAdmin} editMode={!!briefEdit} onCancel={()=>{setBriefEdit(null);setBrief(emptyBrief());setTab(0);}}/>}
        {tab===2&&<TabKanban S={S} solicitudes={isDisenador?solicitudes.filter(s=>s.responableNombre===uName):solicitudes} config={config} isAdmin={isAdmin} isDisenador={isDisenador} asignarDis={asignarDis} marcarListo={marcarListo} aprobarEntrega={aprobarEntrega} rechazarEntrega={rechazarEntrega} uId={uId} uName={uName} showToast={showToast}/>}
        {tab===3&&<TabDashboard S={S} solicitudes={isDisenador?solicitudes.filter(s=>s.responableNombre===uName):solicitudes} config={config} kpis={kpis} dashLvl={dashLvl} setDashLvl={setDashLvl} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} isDisenador={isDisenador}/>}
        {tab===4&&isAdmin&&<TabConfig S={S} config={config} setConfig={setConfig} saveConfig={saveConfig} cfgTab={cfgTab} setCfgTab={setCfgTab} newTipo={newTipo} setNewTipo={setNewTipo} newDis={newDis} setNewDis={setNewDis} showNewT={showNewT} setShowNewT={setShowNewT} showNewD={showNewD} setShowNewD={setShowNewD} showToast={showToast}/>}
      </div>

      {/* MODAL BRIEF */}
      {briefModal&&<BriefModal S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} onClose={()=>{setBriefModal(false);setBriefEdit(null);setBrief(emptyBrief());}} isAdmin={isAdmin} editMode={!!briefEdit}/>}

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a2f4a",color:"#fff",padding:"11px 22px",borderRadius:24,fontSize:13,fontWeight:700,zIndex:99,boxShadow:"0 6px 24px rgba(0,0,0,.25)",whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}

/* ══ LOGIN ══════════════════════════════════════════════ */
// Reemplaza completamente el LoginScreen anterior de PIN.
// Busca en Firestore trade_users por nombre + dni.
function LoginScreen({onLogin, loginError, loginLoading}){
  const [nombre,  setNombre]  = useState("");
  const [dni,     setDni]     = useState("");
  const [showDni, setShowDni] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(nombre, dni);
  };

  const inpS = {
    width:"100%", padding:"13px 14px", borderRadius:12,
    background:"rgba(255,255,255,0.08)", border:"1.5px solid rgba(255,255,255,0.15)",
    color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box",
    fontFamily:"'DM Sans',system-ui,sans-serif", transition:"border-color .2s",
  };

  return(
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"linear-gradient(160deg,#0f1f35 0%,#1a2f4a 60%,#0d1b2e 100%)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:380,background:"rgba(255,255,255,0.05)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"40px 36px"}}>

        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🎨</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#fff"}}>VEGA · DESIGN TRACKER</div>
            <div style={{fontSize:10,color:"#8aaabb",letterSpacing:".06em"}}>GESTIÓN DE DISEÑO Y PRODUCCIÓN</div>
          </div>
        </div>

        <div style={{color:"#fff",fontSize:20,fontWeight:700,marginBottom:4}}>Bienvenido</div>
        <div style={{color:"#8aaabb",fontSize:13,marginBottom:24}}>Ingresa con tu nombre completo y DNI</div>

        {/* Error */}
        {loginError&&(
          <div style={{background:"rgba(231,76,60,.15)",border:"1px solid rgba(231,76,60,.3)",borderRadius:10,padding:"10px 14px",color:"#ff7675",fontSize:12,marginBottom:16}}>
            ⚠ {loginError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",color:"#8aaabb",fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Nombre completo</label>
            <input
              style={inpS} type="text" placeholder="Ej: María Castillo"
              value={nombre} onChange={e=>setNombre(e.target.value)} autoFocus
              onFocus={e=>e.target.style.borderColor="#6c5ce7"}
              onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}
            />
          </div>

          {/* DNI */}
          <div style={{marginBottom:24}}>
            <label style={{display:"block",color:"#8aaabb",fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>DNI</label>
            <div style={{position:"relative"}}>
              <input
                style={inpS} type={showDni?"text":"password"} placeholder="Tu número de DNI"
                value={dni} onChange={e=>setDni(e.target.value)}
                onFocus={e=>e.target.style.borderColor="#6c5ce7"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}
              />
              <button type="button" onClick={()=>setShowDni(v=>!v)}
                style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#8aaabb",fontSize:15,padding:0}}>
                {showDni?"🙈":"👁️"}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loginLoading}
            style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",color:"#fff",fontSize:14,fontWeight:700,cursor:loginLoading?"not-allowed":"pointer",opacity:loginLoading?.7:1}}>
            {loginLoading?"Verificando...":"Ingresar →"}
          </button>
        </form>

        <div style={{color:"rgba(138,170,187,.6)",fontSize:11,textAlign:"center",marginTop:20}}>
          ¿Problemas para ingresar? Contacta al administrador.
        </div>
      </div>
    </div>
  );
}

/* ══ TAB SOLICITUDES ════════════════════════════════════ */
function TabSolicitudes({S,solicitudes,kpis,config,fStat,setFStat,fTipo,setFTipo,fResp,setFResp,busq,setBusq,isAdmin,isDisenador,asignarDis,aprobarEntrega,rechazarEntrega,eliminarSolicitud,setBriefEdit,setBrief,setBriefModal,setTab,showToast,uId,uName}){
  const [assignModal,setAssignModal]=useState(null);
  const [rejectModal,setRejectModal]=useState(null);
  const [rejectMotivo,setRejectMotivo]=useState("");
  const [delModal,setDelModal]=useState(null);
  const tipos=config.tipos||[];
  const dis=config.disenadores||[];

  return(
    <div>
      {/* KPIs */}
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

      {/* Filtros */}
      <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span>
          <input placeholder="Buscar solicitud..." value={busq} onChange={e=>setBusq(e.target.value)} style={{...S.inp,paddingLeft:32,maxWidth:200,fontSize:12}}/>
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
          <option value="Todos">Todos los diseñadores</option>
          {dis.map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>}
        <span style={{...S.pill("#6c5ce7","#f0edff"),marginLeft:"auto"}}>{solicitudes.length} solicitudes</span>
      </div>

      {/* Tabla */}
      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#f8fafc"}}>
                {["SOLICITUD","TIPO","ESTADO","RESPONSABLE","HH","DEADLINE","ÁREA",""].map((h,i)=>(
                  <th key={i} style={{padding:"9px 12px",textAlign:i>1?"center":"left",color:"#5a7a9a",fontWeight:700,fontSize:9,letterSpacing:".06em",borderBottom:"1px solid #e9eef5",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:36,color:"#b2bec3"}}>Sin solicitudes</td></tr>}
              {solicitudes.map(req=>{
                const tipo=tipos.find(t=>t.id===req.tipo);
                const resp=dis.find(d=>d.id===req.responableId);
                const c=STAT_C[req.stat]||"#b2bec3";
                const hoy=todayStr();
                const vencida=req.deadline&&hoy>req.deadline&&!["entregado","cancelado"].includes(req.stat);
                return(
                  <tr key={req.id} style={{borderBottom:"1px solid #f5f7fa"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fcff"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"10px 12px"}}>
                      <div style={{fontWeight:700,color:"#1a2f4a",marginBottom:2}}>{req.titulo}</div>
                      <div style={{fontSize:9,color:"#8aaabb"}}>{req.id} · {req.creadoPor} · {req.creadoEn?.slice(0,10)}</div>
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <span style={S.pill(c+"cc",c+"18")}>{tipo?.e||"📌"} {tipo?.n||req.tipo}</span>
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:c+"18"}}>{STAT_L[req.stat]||req.stat}</span>
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      {resp
                        ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                            <div style={{width:24,height:24,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{resp.iniciales||getIniciales(resp.nombre)}</div>
                            <span style={{fontSize:10,color:"#5a7a9a"}}>{resp.nombre.split(" ")[0]}</span>
                          </div>
                        :<span style={{fontSize:10,color:"#b2bec3"}}>Sin asignar</span>}
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      {req.hReal>0
                        ?<span style={{fontWeight:700,color:req.hReal>(parseFloat(req.hEst)||99)?"#e17055":"#00b894"}}>{req.hReal}h</span>
                        :<span style={{color:"#b2bec3"}}>— / {req.hEst}h</span>}
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <span style={{fontWeight:700,color:vencida?"#e17055":"#5a7a9a",fontSize:11}}>{req.deadline||"—"}</span>
                      {vencida&&<div style={{fontSize:8,color:"#e17055",fontWeight:700}}>VENCIDO</div>}
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <span style={S.pill("#5a7a9a","#f0f4f8")}>{req.area||"—"}</span>
                    </td>
                    <td style={{padding:"10px 8px",textAlign:"center"}}>
                      <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                        {isAdmin&&req.stat==="pendiente"&&(
                          <button onClick={()=>setAssignModal(req)} style={{padding:"4px 9px",borderRadius:7,border:"1px solid #6c5ce7",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:10,fontWeight:700}}>Asignar</button>
                        )}
                        {isAdmin&&req.stat==="aprobacion"&&(
                          <>
                            <button onClick={()=>aprobarEntrega(req.id)} style={{padding:"4px 8px",borderRadius:7,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>✓ Aprobar</button>
                            <button onClick={()=>setRejectModal(req)} style={{padding:"4px 8px",borderRadius:7,border:"none",background:"#ffeae6",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
                          </>
                        )}
                        {isDisenador&&req.stat==="en_diseno"&&req.responableNombre===uName&&(
                          <button onClick={()=>marcarListo&&marcarListo(req.id)} style={{padding:"4px 9px",borderRadius:7,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>Listo →</button>
                        )}
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

      {/* Modal asignar */}
      {assignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:400}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:4}}>Asignar diseñador</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:16}}>{assignModal.titulo}</div>
            {(config.disenadores||[]).filter(d=>d.activo!==false).map(d=>(
              <button key={d.id} onClick={()=>{asignarDis(assignModal.id,d.id);setAssignModal(null);}}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 14px",borderRadius:11,border:"1px solid #e2e8f0",background:"#fff",cursor:"pointer",marginBottom:7,textAlign:"left"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#1a2f4a"}}>{d.nombre}</div>
                  <div style={{fontSize:10,color:"#8aaabb"}}>{d.rol} · {d.hSem}h/sem</div>
                </div>
              </button>
            ))}
            <button onClick={()=>setAssignModal(null)} style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12,marginTop:4}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal rechazar */}
      {rejectModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:400}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:16}}>Rechazar entrega</div>
            <label style={{fontSize:10,fontWeight:700,color:"#5a7a9a",display:"block",marginBottom:5}}>MOTIVO DE RECHAZO</label>
            <input value={rejectMotivo} onChange={e=>setRejectMotivo(e.target.value)} placeholder="Ej: Falta imagen del producto principal..." style={{...S.inp,marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{rechazarEntrega(rejectModal.id,rejectMotivo);setRejectModal(null);setRejectMotivo("");}} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#e17055,#1a2f4a)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Enviar de vuelta</button>
              <button onClick={()=>{setRejectModal(null);setRejectMotivo("");}} style={{padding:"11px 16px",borderRadius:10,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:13}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {delModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:6}}>¿Eliminar solicitud?</div>
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

/* ══ TAB BRIEF / FORM ════════════════════════════════════ */
function TabBrief({S,brief,setBrief,config,guardarSolicitud,isAdmin,editMode,onCancel}){
  const tipos=config.tipos||[];
  const areas=config.areas||AREAS_DEFAULT;
  const set=(k,v)=>setBrief(p=>({...p,[k]:v}));
  const toggleMat=(m)=>setBrief(p=>({...p,materiales:p.materiales.includes(m)?p.materiales.filter(x=>x!==m):[...p.materiales,m]}));

  return(
    <div style={{maxWidth:740,margin:"0 auto"}}>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:"#1a2f4a",marginBottom:3}}>{editMode?"Editar solicitud":"Nueva solicitud de diseño"}</div>
      <div style={{fontSize:11,color:"#8aaabb",marginBottom:18}}>Completa el brief — el equipo de diseño lo recibirá automáticamente</div>

      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={1} label="Información general" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div style={{gridColumn:"1/-1"}}>
            <label style={S.lbl}>TÍTULO DE LA SOLICITUD <span style={{color:"#e17055"}}>*</span></label>
            <input value={brief.titulo} onChange={e=>set("titulo",e.target.value)} placeholder="Ej: Catálogo Verano 2026" style={S.inp}/>
          </div>
          <div>
            <label style={S.lbl}>SOLICITANTE</label>
            <input value={brief.solicitante} onChange={e=>set("solicitante",e.target.value)} placeholder="Tu nombre" style={S.inp}/>
          </div>
          <div>
            <label style={S.lbl}>ÁREA SOLICITANTE</label>
            <select value={brief.area} onChange={e=>set("area",e.target.value)} style={S.inp}>
              {areas.map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>DEADLINE REQUERIDO <span style={{color:"#e17055"}}>*</span></label>
            <input type="date" value={brief.deadline} onChange={e=>set("deadline",e.target.value)} style={S.inp}/>
          </div>
          <div>
            <label style={S.lbl}>PRIORIDAD</label>
            <select value={brief.prioridad} onChange={e=>set("prioridad",e.target.value)} style={S.inp}>
              {["Normal","Media","Alta","Urgente"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={2} label="Tipo de solicitud" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
          {tipos.filter(t=>t.activo!==false).map(t=>(
            <label key={t.id} onClick={()=>set("tipo",t.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 11px",borderRadius:10,border:`1.5px solid ${brief.tipo===t.id?"#6c5ce7":"#e2e8f0"}`,background:brief.tipo===t.id?"#f0edff":"#fff",cursor:"pointer"}}>
              <input type="radio" name="tipo" checked={brief.tipo===t.id} onChange={()=>set("tipo",t.id)} style={{accentColor:"#6c5ce7"}}/>
              <span style={{fontSize:13}}>{t.e}</span>
              <span style={{fontSize:11,fontWeight:700,color:brief.tipo===t.id?"#6c5ce7":"#1a2f4a"}}>{t.n}</span>
            </label>
          ))}
        </div>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>OBJETIVO Y PÚBLICO</label>
          <textarea value={brief.objetivo} onChange={e=>set("objetivo",e.target.value)} rows={2} placeholder="¿Qué se busca lograr? ¿A quién va dirigido?" style={{...S.inp,resize:"vertical"}}/>
        </div>
        <div>
          <label style={S.lbl}>MENSAJE PRINCIPAL</label>
          <textarea value={brief.mensaje} onChange={e=>set("mensaje",e.target.value)} rows={2} placeholder='Frase o concepto clave.' style={{...S.inp,resize:"vertical"}}/>
        </div>
      </div>

      <div style={{...S.card,padding:18,marginBottom:12}}>
        <SectionHeader n={3} label="Materiales y medidas" color="#6c5ce7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
          {MATERIALES.map(m=>(
            <label key={m} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",borderRadius:9,border:`1px solid ${brief.materiales.includes(m)?"#6c5ce7":"#e2e8f0"}`,background:brief.materiales.includes(m)?"#f0edff":"#fff",cursor:"pointer",fontSize:11}}>
              <input type="checkbox" checked={brief.materiales.includes(m)} onChange={()=>toggleMat(m)} style={{accentColor:"#6c5ce7"}}/>
              {m}
            </label>
          ))}
        </div>
        <div>
          <label style={S.lbl}>TAMAÑOS / MEDIDAS ESPECÍFICAS</label>
          <input value={brief.medidas} onChange={e=>set("medidas",e.target.value)} placeholder="Ej: 1080×1920px / A3 vertical" style={S.inp}/>
        </div>
      </div>

      <div style={{...S.card,padding:18,marginBottom:16}}>
        <SectionHeader n={4} label="Estilo, recursos y referencias" color="#6c5ce7"/>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>TONALIDAD VISUAL</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {TONOS.map(t=>(
              <label key={t} onClick={()=>set("tono",t)} style={{padding:"6px 13px",borderRadius:20,border:`1.5px solid ${brief.tono===t?"#6c5ce7":"#e2e8f0"}`,background:brief.tono===t?"#f0edff":"#fff",cursor:"pointer",fontSize:11,fontWeight:brief.tono===t?700:400,color:brief.tono===t?"#6c5ce7":"#5a7a9a"}}>
                <input type="radio" name="tono" checked={brief.tono===t} onChange={()=>set("tono",t)} style={{display:"none"}}/>{t}
              </label>
            ))}
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>MECÁNICA / DINÁMICA</label>
          <textarea value={brief.mecanica} onChange={e=>set("mecanica",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/>
        </div>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>PRODUCTOS INVOLUCRADOS</label>
          <input value={brief.productosInvolucrados} onChange={e=>set("productosInvolucrados",e.target.value)} placeholder="Producto 1, Producto 2..." style={S.inp}/>
        </div>
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>RESTRICCIONES / NO HACER</label>
          <input value={brief.restricciones} onChange={e=>set("restricciones",e.target.value)} style={S.inp}/>
        </div>
        <div>
          <label style={S.lbl}>COMENTARIOS ADICIONALES / REFERENCIAS</label>
          <textarea value={brief.comentarios} onChange={e=>set("comentarios",e.target.value)} rows={2} style={{...S.inp,resize:"vertical"}}/>
        </div>
      </div>

      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        {onCancel&&<button onClick={onCancel} style={{padding:"12px 20px",borderRadius:11,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:13,fontWeight:700}}>Cancelar</button>}
        <button onClick={guardarSolicitud} style={{...S.btn("#6c5ce7"),padding:"12px 28px",fontSize:13}}>
          {editMode?"Guardar cambios":"Enviar solicitud →"}
        </button>
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

/* ══ BRIEF MODAL ════════════════════════════════════════ */
function BriefModal({S,brief,setBrief,config,guardarSolicitud,onClose,isAdmin,editMode}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.65)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)",padding:"20px 16px",overflowY:"auto"}}>
      <div style={{...S.card,width:"100%",maxWidth:740,padding:0,position:"relative"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #f0f4f8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#1a2f4a"}}>{editMode?"Editar solicitud":"Nueva solicitud de diseño"}</div>
          <button onClick={onClose} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>✕ Cerrar</button>
        </div>
        <div style={{padding:20,maxHeight:"80vh",overflowY:"auto"}}>
          <TabBrief S={S} brief={brief} setBrief={setBrief} config={config} guardarSolicitud={guardarSolicitud} isAdmin={isAdmin} editMode={editMode} onCancel={onClose}/>
        </div>
      </div>
    </div>
  );
}

/* ══ TAB KANBAN ════════════════════════════════════════ */
function TabKanban({S,solicitudes,config,isAdmin,isDisenador,asignarDis,marcarListo,aprobarEntrega,rechazarEntrega,uId,uName,showToast}){
  const dis=config.disenadores||[];
  const tipos=config.tipos||[];
  const [assignModal,setAssignModal]=useState(null);
  const [rejectModal,setRejectModal]=useState(null);
  const [rejectMotivo,setRejectMotivo]=useState("");

  const cols=[
    {id:"pendiente",  label:"Brief recibido",c:"#f6a623",ids:["pendiente"]},
    {id:"en_diseno",  label:"En diseño",     c:"#6c5ce7",ids:["en_diseno"]},
    {id:"aprobacion", label:"En aprobación", c:"#0984e3",ids:["aprobacion"]},
    {id:"entregado",  label:"Entregado",     c:"#00b894",ids:["entregado","retrasado"]},
  ];
  const getByStat=(ids)=>solicitudes.filter(s=>ids.includes(s.stat));

  return(
    <div>
      {/* HH por diseñador — solo admin lo ve completo; diseñador ve solo su barra */}
      {!isDisenador&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:16}}>
        {dis.filter(d=>d.activo!==false).map(d=>{
          const activos=solicitudes.filter(s=>s.responableId===d.id&&["en_diseno","aprobacion"].includes(s.stat));
          const hUsadas=solicitudes.filter(s=>s.responableId===d.id&&s.hReal>0).reduce((a,s)=>a+s.hReal,0);
          const pct=Math.round((hUsadas/(d.hSem||48))*100);
          return(
            <div key={d.id} style={{...S.card,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div><div style={{fontWeight:700,fontSize:12}}>{d.nombre}</div><div style={{fontSize:9,color:"#8aaabb"}}>{d.rol}</div></div>
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

      {/* Columnas kanban */}
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
                  const resp=dis.find(d=>d.id===req.responableId);
                  const c=STAT_C[req.stat]||"#b2bec3";
                  const hoy=todayStr();
                  const vencida=req.deadline&&hoy>req.deadline&&!["entregado","cancelado"].includes(req.stat);
                  return(
                    <div key={req.id} style={{...S.card,padding:12,borderLeft:`3px solid ${c}`,background:req.stat==="retrasado"?"#fffaf8":"#fff"}}>
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
                        {isDisenador&&req.stat==="en_diseno"&&req.responableNombre===uName&&<button onClick={()=>marcarListo(req.id)} style={{flex:1,padding:"5px 8px",borderRadius:7,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>Listo →</button>}
                        {isAdmin&&req.stat==="aprobacion"&&<>
                          <button onClick={()=>aprobarEntrega(req.id)} style={{flex:1,padding:"5px 7px",borderRadius:7,border:"none",background:"#00b894",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>✓</button>
                          <button onClick={()=>setRejectModal(req)} style={{padding:"5px 8px",borderRadius:7,border:"none",background:"#ffeae6",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
                        </>}
                      </div>
                    </div>
                  );
                })}
                {items.length===0&&<div style={{padding:"20px 14px",borderRadius:10,border:"1.5px dashed #e2e8f0",textAlign:"center",fontSize:11,color:"#b2bec3"}}>Sin trabajos</div>}
              </div>
            </div>
          );
        })}
      </div>

      {assignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:24,width:"90%",maxWidth:380}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:4,color:"#1a2f4a"}}>Asignar diseñador</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:14}}>{assignModal.titulo}</div>
            {dis.filter(d=>d.activo!==false).map(d=>(
              <button key={d.id} onClick={()=>{asignarDis(assignModal.id,d.id);setAssignModal(null);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 13px",borderRadius:10,border:"1px solid #e2e8f0",background:"#fff",cursor:"pointer",marginBottom:6,textAlign:"left"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div><div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{d.nombre}</div><div style={{fontSize:9,color:"#8aaabb"}}>{d.rol}</div></div>
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
            <label style={{fontSize:10,fontWeight:700,color:"#5a7a9a",display:"block",marginBottom:5}}>MOTIVO</label>
            <input value={rejectMotivo} onChange={e=>setRejectMotivo(e.target.value)} placeholder="¿Qué debe corregirse?" style={{...S.inp,marginBottom:12}}/>
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
function TabDashboard({S,solicitudes,config,kpis,dashLvl,setDashLvl,gYear,setGYear,gMonth,setGMonth,gFiltResp,setGFiltResp,gFiltTipo,setGFiltTipo,gFiltStat,setGFiltStat,selReq,setSelReq,isDisenador}){
  const dis=config.disenadores||[];
  const tipos=config.tipos||[];

  // Diseñador solo ve nivel operativo (sus trabajos), viewer y admin ven los 3 niveles
  const nivelesDisponibles = isDisenador
    ? [{n:3,label:"Mis trabajos",sub:"Vista personal",icon:"🎨"}]
    : [
        {n:1,label:"Dirección / CEO",sub:"Visión ejecutiva",icon:"👑"},
        {n:2,label:"Dirección / Gerencia",sub:"Análisis y causas",icon:"📊"},
        {n:3,label:"Operativo",sub:"Seguimiento diario",icon:"⚙️"},
      ];

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {nivelesDisponibles.map(l=>(
          <button key={l.n} onClick={()=>setDashLvl(l.n)}
            style={{flex:1,padding:"12px 10px",borderRadius:12,border:`2px solid ${dashLvl===l.n?"#6c5ce7":"#e2e8f0"}`,background:dashLvl===l.n?"#1a2f4a":"#fff",color:dashLvl===l.n?"#fff":"#5a7a9a",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
            <div style={{fontSize:18,marginBottom:4}}>{l.icon}</div>
            <div style={{fontSize:11,fontWeight:800}}>{l.label}</div>
            <div style={{fontSize:9,opacity:.7,marginTop:2}}>{l.sub}</div>
          </button>
        ))}
      </div>

      {dashLvl===1&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[
              {label:"Eficiencia global",val:kpis.efic+"%",c:sc(kpis.efic),icon:"🎯",sub:`${kpis.ok} de ${kpis.ok+kpis.delay} completadas`},
              {label:"Entregas a tiempo",val:kpis.ok,c:"#00b894",icon:"✅",sub:`${kpis.delay} con retraso`},
              {label:"HH facturadas",val:kpis.hTotReal+"h",c:"#0984e3",icon:"⏱️",sub:`est: ${kpis.hTotEst}h`},
              {label:"En proceso",val:kpis.active,c:"#6c5ce7",icon:"🎨",sub:`${kpis.pend} pendientes`},
            ].map(k=>(
              <div key={k.label} style={{...S.card,padding:14,borderLeft:`4px solid ${k.c}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:18}}>{k.icon}</span>
                  <span style={{fontSize:8,color:"#b2bec3",fontWeight:700}}>{k.label.toUpperCase()}</span>
                </div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:k.c,lineHeight:1}}>{k.val}</div>
                <div style={{fontSize:9,color:"#5a7a9a",marginTop:4}}>{k.sub}</div>
              </div>
            ))}
          </div>
          <GanttDiario S={S} solicitudes={solicitudes} config={config} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} showResp={false}/>
        </div>
      )}

      {dashLvl===2&&(
        <div>
          <GanttDiario S={S} solicitudes={solicitudes} config={config} gYear={gYear} setGYear={setGYear} gMonth={gMonth} setGMonth={setGMonth} gFiltResp={gFiltResp} setGFiltResp={setGFiltResp} gFiltTipo={gFiltTipo} setGFiltTipo={setGFiltTipo} gFiltStat={gFiltStat} setGFiltStat={setGFiltStat} selReq={selReq} setSelReq={setSelReq} showResp={true}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
            <div style={{...S.card,padding:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#e17055",marginBottom:12}}>Causa raíz de retrasos</div>
              {solicitudes.filter(s=>s.stat==="retrasado"&&s.obs).slice(0,5).map(s=>(
                <div key={s.id} style={{padding:"8px 10px",borderRadius:9,background:"#fff8ec",border:"1px solid #FAC775",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#854F0B",marginBottom:2}}>{s.titulo}</div>
                  <div style={{fontSize:9,color:"#633806"}}>{s.obs?.slice(0,80)}</div>
                </div>
              ))}
              {solicitudes.filter(s=>s.stat==="retrasado").length===0&&<div style={{fontSize:12,color:"#b2bec3",textAlign:"center",padding:"20px 0"}}>Sin retrasos registrados ✅</div>}
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
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,fontWeight:700,color:"#1a2f4a"}}>{d.nombre}</span>
                        <span style={{fontSize:10,fontWeight:700,color:ef!==null?sc(ef):"#b2bec3"}}>{ef!==null?ef+"%":"—"}</span>
                      </div>
                      <div style={{fontSize:9,color:"#8aaabb"}}>{dOk} a tiempo · {dDel} retrasados · {Math.round(dHR*10)/10}h reales</div>
                      <div style={{height:3,background:"#f0f4f8",borderRadius:2,marginTop:3}}>
                        {ef!==null&&<div style={{width:ef+"%",height:"100%",background:sc(ef),borderRadius:2}}/>}
                      </div>
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
            {[
              {label:"En proceso",val:solicitudes.filter(s=>["en_diseno","aprobacion"].includes(s.stat)).length,c:"#6c5ce7",icon:"🎨"},
              {label:"Vencen hoy",val:solicitudes.filter(s=>s.deadline===todayStr()&&!["entregado","cancelado"].includes(s.stat)).length,c:"#e17055",icon:"⚠️"},
              {label:"Entregados hoy",val:solicitudes.filter(s=>s.tsEntregado?.slice(0,10)===todayStr()).length,c:"#00b894",icon:"✅"},
            ].map(k=>(
              <div key={k.label} style={{...S.card,padding:14,borderLeft:`4px solid ${k.c}`}}>
                <div style={{fontSize:9,color:"#8aaabb",fontWeight:700,marginBottom:5}}>{k.label.toUpperCase()}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:k.c}}>{k.val}</div>
              </div>
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
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.titulo}</div>
                    <div style={{fontSize:9,color:"#8aaabb"}}>{tipo?.e||"📌"} {tipo?.n||req.tipo} · {req.area}</div>
                  </div>
                  {resp&&<div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{resp.iniciales||getIniciales(resp.nombre)}</div>
                    <span style={{fontSize:10,color:"#5a7a9a"}}>{resp.nombre.split(" ")[0]}</span>
                  </div>}
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:vencida?"#e17055":"#5a7a9a"}}>{req.deadline||"—"}</div>
                    {vencida&&<div style={{fontSize:8,color:"#e17055",fontWeight:700}}>VENCIDO</div>}
                  </div>
                  <span style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,color:c,background:c+"18"}}>{STAT_L[req.stat]||req.stat}</span>
                </div>
              );
            })}
            {solicitudes.filter(s=>["en_diseno","aprobacion","pendiente"].includes(s.stat)).length===0&&
              <div style={{textAlign:"center",padding:"32px",color:"#b2bec3",fontSize:12}}>Sin trabajos activos ✅</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ GANTT DIARIO ════════════════════════════════════════ */
function GanttDiario({S,solicitudes,config,gYear,setGYear,gMonth,setGMonth,gFiltResp,setGFiltResp,gFiltTipo,setGFiltTipo,gFiltStat,setGFiltStat,selReq,setSelReq,showResp}){
  const dias=diasEnMes(gYear,gMonth);
  const dis=config.disenadores||[];
  const tipos=config.tipos||[];

  const navMes=(dir)=>{
    let m=gMonth+dir, y=gYear;
    if(m<0){m=11;y--;} if(m>11){m=0;y++;}
    setGMonth(m); setGYear(y);
  };

  const filtered=useMemo(()=>{
    return solicitudes.filter(s=>{
      const si=s.creadoEn?.slice(0,7);
      const sd=s.deadline?.slice(0,7);
      const ym=`${gYear}-${String(gMonth+1).padStart(2,"0")}`;
      if(si>ym&&sd<ym) return false;
      if(!s.creadoEn&&!s.deadline) return false;
      if(gFiltResp&&s.responableId!==gFiltResp) return false;
      if(gFiltTipo&&s.tipo!==gFiltTipo) return false;
      if(gFiltStat&&s.stat!==gFiltStat) return false;
      return true;
    });
  },[solicitudes,gYear,gMonth,gFiltResp,gFiltTipo,gFiltStat]);

  const getDayInMonth=(dateStr)=>{
    if(!dateStr) return null;
    const [y,m,d]=dateStr.split("-").map(Number);
    if(y===gYear&&m===gMonth+1) return d;
    if(new Date(dateStr)<new Date(gYear,gMonth,1)) return 0;
    if(new Date(dateStr)>new Date(gYear,gMonth+1,0)) return dias+1;
    return null;
  };

  const today=new Date();
  const todayD=today.getFullYear()===gYear&&today.getMonth()===gMonth?today.getDate():null;

  return(
    <div style={{...S.card,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid #f0f4f8"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <button onClick={()=>navMes(-1)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>←</button>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#1a2f4a",flex:1,textAlign:"center"}}>{MESES_N[gMonth].toUpperCase()} {gYear}</span>
          <button onClick={()=>navMes(1)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>→</button>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <select value={gFiltResp} onChange={e=>setGFiltResp(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}>
            <option value="">Todos los diseñadores</option>
            {dis.map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <select value={gFiltTipo} onChange={e=>setGFiltTipo(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}>
            <option value="">Todos los tipos</option>
            {tipos.map(t=><option key={t.id} value={t.id}>{t.e} {t.n}</option>)}
          </select>
          <select value={gFiltStat} onChange={e=>setGFiltStat(e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:11}}>
            <option value="">Todos los estados</option>
            {Object.entries(STAT_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{...S.pill("#00b894","#e8faf5")}}>✅ Entregado</span>
            <span style={{...S.pill("#6c5ce7","#f0edff")}}>● En diseño</span>
            <span style={{...S.pill("#e17055","#ffeae6")}}>⚠ Retrasado</span>
            <span style={{...S.pill("#f6a623","#fff8ec")}}>⏳ Pendiente</span>
          </div>
        </div>
      </div>

      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"480px"}}>
        <div style={{minWidth:Math.max(800,180+dias*28)+"px"}}>
          <div style={{display:"flex",alignItems:"center",background:"#f8fafc",borderBottom:"2px solid #e2e8f0",position:"sticky",top:0,zIndex:5}}>
            <div style={{width:showResp?210:180,flexShrink:0,padding:"8px 10px",fontSize:9,fontWeight:700,color:"#5a7a9a",letterSpacing:".05em",borderRight:"1px solid #e2e8f0",position:"sticky",left:0,background:"#f8fafc",zIndex:6}}>SOLICITUD</div>
            {Array.from({length:dias},(_,i)=>{
              const d=i+1;
              const dow=new Date(gYear,gMonth,d).getDay();
              const isW=dow===0||dow===6;
              const isT=d===todayD;
              return(
                <div key={d} style={{flex:1,minWidth:28,textAlign:"center",padding:"4px 1px",background:isT?"#6c5ce7":isW?"#fafafa":"transparent",borderRadius:isT?4:0}}>
                  <div style={{fontSize:7,color:isT?"#fff":isW?"#c8d8e8":"#8aaabb",fontWeight:700}}>{DIAS_C[dow]}</div>
                  <div style={{fontSize:10,fontWeight:800,color:isT?"#fff":isW?"#b2bec3":"#1a2f4a"}}>{d}</div>
                </div>
              );
            })}
          </div>
          {filtered.length===0&&(
            <div style={{padding:"32px",textAlign:"center",color:"#b2bec3",fontSize:12}}>Sin solicitudes para los filtros seleccionados</div>
          )}
          {filtered.map(req=>{
            const tipo=tipos.find(t=>t.id===req.tipo);
            const resp=dis.find(d=>d.id===req.responableId);
            const c=STAT_C[req.stat]||"#b2bec3";
            const startD=Math.max(1,getDayInMonth(req.creadoEn?.slice(0,10))||1);
            const endD=Math.min(dias,getDayInMonth(req.deadline)||dias);
            const startPct=((startD-1)/dias)*100;
            const widthPct=((endD-startD+1)/dias)*100;
            const span=endD-startD+1;
            return(
              <div key={req.id} style={{display:"flex",alignItems:"center",borderBottom:"1px solid #f5f7fa",minHeight:34,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f8fcff"}
                onMouseLeave={e=>e.currentTarget.style.background=""}
                onClick={()=>setSelReq(selReq?.id===req.id?null:req)}>
                <div style={{width:showResp?210:180,flexShrink:0,padding:"0 10px",display:"flex",alignItems:"center",gap:6,borderRight:"1px solid #e2e8f0",background:"#fff",position:"sticky",left:0,zIndex:2,boxShadow:"2px 0 4px rgba(0,0,0,.04)",minHeight:34}}>
                  <div style={{width:4,height:18,borderRadius:2,background:c,flexShrink:0}}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.titulo}</div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {showResp&&resp&&<div style={{width:14,height:14,borderRadius:"50%",background:resp.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",fontWeight:700,flexShrink:0}}>{resp.iniciales||getIniciales(resp.nombre)}</div>}
                      <span style={{fontSize:8,color:"#8aaabb"}}>{tipo?.e||"📌"} {req.id}</span>
                    </div>
                  </div>
                </div>
                <div style={{flex:1,position:"relative",height:34}}>
                  {Array.from({length:dias},(_,i)=>{
                    const d=i+1;
                    const dow=new Date(gYear,gMonth,d).getDay();
                    return <div key={d} style={{position:"absolute",left:((i)/dias)*100+"%",width:(1/dias)*100+"%",height:"100%",background:d===todayD?"#f0edff":dow===0||dow===6?"#fafafa":"transparent",borderRight:"1px solid #f5f7fa"}}/>;
                  })}
                  {startD<=dias&&endD>=1&&(
                    <div style={{position:"absolute",left:startPct+"%",width:widthPct+"%",top:7,height:20,background:c,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",opacity:.9,zIndex:1}}>
                      <span style={{fontSize:9,fontWeight:700,color:"#fff",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                        {req.stat==="retrasado"?"⚠ ":""}
                        {span>=5?req.titulo:span>=3?(req.hReal>0?req.hReal+"h":req.hEst+"h"):""}
                      </span>
                    </div>
                  )}
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
                <span style={S.pill("#5a7a9a","#f0f4f8")}>Solicitado por: {selReq.creadoPor}</span>
                {selReq.prioridad&&<span style={{...S.pill(selReq.prioridad==="Urgente"?"#dc2626":selReq.prioridad==="Alta"?"#e17055":selReq.prioridad==="Media"?"#f6a623":"#00b894","#f8fafc")}}>🔥 {selReq.prioridad}</span>}
              </div>
            </div>
            <button onClick={()=>setSelReq(null)} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[
              {label:"INICIO",val:selReq.creadoEn?.slice(0,10)||"—",c:"#5a7a9a"},
              {label:"DEADLINE",val:selReq.deadline||"—",c:selReq.deadline&&todayStr()>selReq.deadline?"#e17055":"#5a7a9a"},
              {label:"HH ESTIMADAS",val:(selReq.hEst||"—")+"h",c:"#0984e3"},
              {label:"HH REALES",val:selReq.hReal>0?selReq.hReal+"h":"En proceso",c:selReq.hReal>(parseFloat(selReq.hEst)||99)?"#e17055":"#00b894"},
            ].map(k=>(
              <div key={k.label} style={{background:"#fff",borderRadius:9,padding:"10px 12px",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:8,color:"#8aaabb",fontWeight:700,marginBottom:3}}>{k.label}</div>
                <div style={{fontSize:14,fontWeight:800,color:k.c}}>{k.val}</div>
              </div>
            ))}
          </div>
          {selReq.objetivo&&<div style={{fontSize:11,color:"#5a7a9a",marginBottom:6}}><strong style={{color:"#1a2f4a"}}>Objetivo:</strong> {selReq.objetivo}</div>}
          {selReq.obs&&<div style={{padding:"8px 12px",borderRadius:8,background:"#fff8ec",border:"1px solid #FAC775",fontSize:11,color:"#854F0B"}}><strong>Observación:</strong> {selReq.obs}</div>}
        </div>
      )}
    </div>
  );
}

/* ══ PANEL DISEÑADORES ══════════════════════════════════ */
function DisenaoresPanel({S,dis,config,saveConfig,showNewD,setShowNewD,newDis,setNewDis,showToast}){
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});
  const [delId,    setDelId]    = useState(null);

  const addDis=()=>{
    if(!newDis.nombre.trim())return;
    const ini=getIniciales(newDis.nombre);
    const c=AV_COLORS[dis.length%AV_COLORS.length];
    const d=[...dis,{id:"d"+Date.now(),nombre:newDis.nombre.trim(),iniciales:ini,color:c,rol:newDis.rol,hSem:parseInt(newDis.hSem)||48,activo:true}];
    saveConfig({...config,disenadores:d});
    setNewDis({nombre:"",rol:"Diseñador",hSem:48}); setShowNewD(false);
    showToast("✅ Diseñador agregado");
  };
  const startEdit=(d)=>{ setEditId(d.id); setEditData({nombre:d.nombre,rol:d.rol,hSem:d.hSem,color:d.color||"#6c5ce7"}); };
  const saveEdit=()=>{
    if(!editData.nombre?.trim())return;
    const updated=dis.map(d=>d.id===editId?{...d,nombre:editData.nombre.trim(),iniciales:getIniciales(editData.nombre),rol:editData.rol,hSem:parseInt(editData.hSem)||48,color:editData.color}:d);
    saveConfig({...config,disenadores:updated});
    setEditId(null); showToast("✏️ Diseñador actualizado");
  };
  const toggleDis=(id)=>{
    const updated=dis.map(d=>d.id===id?{...d,activo:!d.activo}:d);
    saveConfig({...config,disenadores:updated});
  };
  const confirmDel=()=>{
    const updated=dis.filter(d=>d.id!==delId);
    saveConfig({...config,disenadores:updated});
    setDelId(null); showToast("🗑️ Diseñador eliminado");
  };

  const ROLES=["Senior","Diseñador","Jr","Practicante"];
  const PALETTE=["#6c5ce7","#00b894","#0984e3","#e17055","#f6a623","#a29bfe","#fd79a8","#00b5b4","#d63031","#2d3436"];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>Diseñadores</div>
          <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>{dis.filter(d=>d.activo!==false).length} activos de {dis.length} registrados</div>
        </div>
        <button onClick={()=>setShowNewD(!showNewD)} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>＋ Nuevo</button>
      </div>
      {showNewD&&(
        <div style={{...S.card,padding:16,marginBottom:12,border:"1.5px solid #a29bfe"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#6c5ce7",marginBottom:10}}>Nuevo diseñador</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,marginBottom:10}}>
            <div><label style={S.lbl}>NOMBRE COMPLETO</label><input value={newDis.nombre} onChange={e=>setNewDis(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Carlos Rodríguez" style={S.inp}/></div>
            <div><label style={S.lbl}>ROL</label>
              <select value={newDis.rol} onChange={e=>setNewDis(p=>({...p,rol:e.target.value}))} style={{...S.inp,width:"auto"}}>
                {ROLES.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div><label style={S.lbl}>HH/SEM</label><input type="number" value={newDis.hSem} onChange={e=>setNewDis(p=>({...p,hSem:e.target.value}))} style={{...S.inp,width:64}} min="8" step="4"/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setShowNewD(false)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={addDis} style={{padding:"8px 18px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Agregar →</button>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {dis.map(d=>(
          <div key={d.id}>
            {editId===d.id
              ?<div style={{...S.card,padding:16,border:"1.5px solid #6c5ce7"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#6c5ce7",marginBottom:10}}>Editando: {d.nombre}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,marginBottom:10}}>
                  <div><label style={S.lbl}>NOMBRE</label><input value={editData.nombre} onChange={e=>setEditData(p=>({...p,nombre:e.target.value}))} style={S.inp}/></div>
                  <div><label style={S.lbl}>ROL</label>
                    <select value={editData.rol} onChange={e=>setEditData(p=>({...p,rol:e.target.value}))} style={{...S.inp,width:"auto"}}>
                      {ROLES.map(r=><option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div><label style={S.lbl}>HH/SEM</label><input type="number" value={editData.hSem} onChange={e=>setEditData(p=>({...p,hSem:e.target.value}))} style={{...S.inp,width:64}} min="8" step="4"/></div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={S.lbl}>COLOR DE AVATAR</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {PALETTE.map(c=>(
                      <div key={c} onClick={()=>setEditData(p=>({...p,color:c}))}
                        style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:editData.color===c?"3px solid #1a2f4a":"3px solid transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {editData.color===c&&<span style={{fontSize:12,color:"#fff",fontWeight:800}}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setEditId(null)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #c8d8e8",background:"#fff",color:"#5a7a9a",cursor:"pointer",fontSize:12}}>Cancelar</button>
                  <button onClick={saveEdit} style={{padding:"8px 18px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#6c5ce7,#1a2f4a)",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Guardar cambios</button>
                </div>
              </div>
              :<div style={{...S.card,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,opacity:d.activo!==false?1:.5}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:d.color||"#6c5ce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700,flexShrink:0}}>{d.iniciales||getIniciales(d.nombre)}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{d.nombre}</div>
                  <div style={{fontSize:10,color:"#8aaabb"}}>{d.rol} · {d.hSem}h/sem · {d.activo!==false?"Activo":"Inactivo"}</div>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>startEdit(d)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #a29bfe",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Editar</button>
                  <button onClick={()=>toggleDis(d.id)} style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${d.activo!==false?"#fecaca":"#bbf7d0"}`,background:d.activo!==false?"#fff1f2":"#f0fdf4",color:d.activo!==false?"#dc2626":"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}}>
                    {d.activo!==false?"Pausar":"Activar"}
                  </button>
                  <button onClick={()=>setDelId(d.id)} style={{padding:"5px 9px",borderRadius:7,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </div>}
          </div>
        ))}
        {dis.length===0&&<div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12,borderRadius:10,border:"1.5px dashed #e2e8f0"}}>Sin diseñadores — agrega el primero</div>}
      </div>
      {delId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,47,74,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)"}}>
          <div style={{...S.card,padding:26,width:"90%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:15,color:"#1a2f4a",marginBottom:6}}>¿Eliminar diseñador?</div>
            <div style={{fontSize:12,color:"#5a7a9a",marginBottom:6}}>{dis.find(d=>d.id===delId)?.nombre}</div>
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

/* ══ PANEL USUARIOS (solo admin) ════════════════════════ */
// Gestiona la colección trade_users: agrega, cambia rol, activa/desactiva.
// El primer usuario admin debe crearse manualmente en Firebase Console:
// Colección: trade_users | campos: nombre, dni, rol:"admin", activo:true
function TabUsuarios({S, showToast}){
  const [usuarios, setUsuarios] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({nombre:"",dni:"",rol:"disenador"});
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");

  const ROLES_U = ["admin","disenador","viewer"];
  const ROL_META = {
    admin:     {emoji:"👑",label:"Administrador",color:"#f6a623",bg:"#fff8ec"},
    disenador: {emoji:"🎨",label:"Diseñador",    color:"#6c5ce7",bg:"#f0eeff"},
    viewer:    {emoji:"👁️",label:"Solo lectura", color:"#0984e3",bg:"#e8f4fd"},
  };

  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"trade_users"), snap=>{
      const arr=[];
      snap.forEach(d=>arr.push({id:d.id,...d.data()}));
      arr.sort((a,b)=>{
        if(a.activo!==b.activo) return b.activo?1:-1;
        return a.nombre.localeCompare(b.nombre);
      });
      setUsuarios(arr);
    });
    return ()=>unsub();
  },[]);

  const handleGuardar = async ()=>{
    if(!form.nombre.trim()||!form.dni.trim()){ showToast("⚠ Completa nombre y DNI"); return; }
    const existe = usuarios.find(u=>u.nombre.toLowerCase()===form.nombre.trim().toLowerCase());
    if(existe){ showToast("⚠ Ya existe un usuario con ese nombre"); return; }
    setSaving(true);
    try{
      await addDoc(collection(db,"trade_users"),{nombre:form.nombre.trim(),dni:form.dni.trim(),rol:form.rol,activo:true});
      setForm({nombre:"",dni:"",rol:"disenador"}); setShowForm(false);
      showToast("✅ Usuario creado");
    }catch(err){ console.error(err); showToast("❌ Error al guardar"); }
    setSaving(false);
  };

  const handleCambiarRol = async (id, nuevoRol)=>{
    try{ await updateDoc(doc(db,"trade_users",id),{rol:nuevoRol}); showToast("✅ Rol actualizado"); }
    catch{ showToast("❌ Error al cambiar rol"); }
  };

  const handleToggle = async (id, activo)=>{
    try{ await updateDoc(doc(db,"trade_users",id),{activo:!activo}); showToast(activo?"⏸ Usuario desactivado":"✅ Usuario activado"); }
    catch{ showToast("❌ Error"); }
  };

  const filtrados = usuarios.filter(u=>
    u.nombre.toLowerCase().includes(search.toLowerCase())||
    (u.rol||"").toLowerCase().includes(search.toLowerCase())
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a"}}>👥 Gestión de usuarios</div>
          <div style={{fontSize:11,color:"#8aaabb",marginTop:2}}>{usuarios.filter(u=>u.activo).length} activos · {usuarios.length} totales</div>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>
          {showForm?"✕ Cancelar":"+ Nuevo usuario"}
        </button>
      </div>

      {showForm&&(
        <div style={{...S.card,padding:18,marginBottom:16,border:"1.5px solid #a29bfe"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1a2f4a",marginBottom:14}}>Nuevo usuario</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={S.lbl}>NOMBRE COMPLETO</label><input style={S.inp} placeholder="Ej: María Castillo" value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/></div>
            <div><label style={S.lbl}>DNI</label><input style={S.inp} placeholder="Número de DNI" value={form.dni} onChange={e=>setForm(p=>({...p,dni:e.target.value}))}/></div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={S.lbl}>ROL</label>
            <div style={{display:"flex",gap:8}}>
              {ROLES_U.map(r=>{
                const m=ROL_META[r];
                return(
                  <button key={r} onClick={()=>setForm(p=>({...p,rol:r}))}
                    style={{padding:"8px 14px",borderRadius:9,border:`1.5px solid ${form.rol===r?m.color:"#e2e8f0"}`,background:form.rol===r?m.bg:"#fff",color:form.rol===r?m.color:"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    {m.emoji} {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={handleGuardar} disabled={saving}
            style={{padding:"9px 18px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12,opacity:saving?.7:1}}>
            {saving?"Guardando...":"Crear usuario"}
          </button>
        </div>
      )}

      <input style={{...S.inp,marginBottom:12}} placeholder="🔍 Buscar por nombre o rol..." value={search} onChange={e=>setSearch(e.target.value)}/>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(u=>{
          const meta=ROL_META[u.rol]||ROL_META.viewer;
          return(
            <div key={u.id} style={{...S.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,opacity:u.activo?1:.5}}>
              <div style={{width:40,height:40,borderRadius:10,background:meta.bg,border:`1.5px solid ${meta.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:meta.color,flexShrink:0}}>
                {getIniciales(u.nombre)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:"#1a2f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.nombre}</div>
                <div style={{fontSize:11,color:"#8aaabb",marginTop:1}}>DNI: {"•".repeat(5)+u.dni.slice(-3)}</div>
              </div>
              <select value={u.rol} onChange={e=>handleCambiarRol(u.id,e.target.value)}
                style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${meta.color}40`,background:meta.bg,color:meta.color,fontWeight:700,fontSize:11,cursor:"pointer",outline:"none"}}>
                {ROLES_U.map(r=><option key={r} value={r}>{ROL_META[r].emoji} {ROL_META[r].label}</option>)}
              </select>
              <button onClick={()=>handleToggle(u.id,u.activo)}
                style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${u.activo?"#fecaca":"#bbf7d0"}`,background:u.activo?"#fff1f2":"#f0fdf4",color:u.activo?"#dc2626":"#16a34a",cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                {u.activo?"Desactivar":"Activar"}
              </button>
            </div>
          );
        })}
        {filtrados.length===0&&(
          <div style={{padding:"28px",textAlign:"center",color:"#b2bec3",fontSize:12,borderRadius:10,border:"1.5px dashed #e2e8f0"}}>
            {search?"Sin resultados":"Sin usuarios — agrega el primero"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══ TAB CONFIG ════════════════════════════════════════ */
function TabConfig({S,config,setConfig,saveConfig,cfgTab,setCfgTab,newTipo,setNewTipo,newDis,setNewDis,showNewT,setShowNewT,showNewD,setShowNewD,showToast}){
  // La pestaña "Usuarios" se agrega al final, solo visible en este componente
  // que ya está protegido por isAdmin en el padre.
  const tabs=["📦 Tipos de trabajo","👥 Diseñadores","📐 Áreas","👤 Usuarios"];
  const tipos=config.tipos||[];
  const dis=config.disenadores||[];
  const areas=config.areas||AREAS_DEFAULT;
  const [newArea,setNewArea]=useState("");

  const addTipo=()=>{
    if(!newTipo.n.trim())return;
    const t=[...tipos,{id:"t"+Date.now(),n:newTipo.n.trim(),e:newTipo.e||"📌",hEst:parseFloat(newTipo.hEst)||2,activo:true}];
    saveConfig({...config,tipos:t});
    setNewTipo({n:"",e:"📌",hEst:2}); setShowNewT(false);
    showToast("✅ Tipo agregado");
  };
  const toggleTipo=(id)=>{
    const t=tipos.map(x=>x.id===id?{...x,activo:!x.activo}:x);
    saveConfig({...config,tipos:t});
  };
  const addArea=()=>{
    if(!newArea.trim())return;
    const a=[...areas,newArea.trim()];
    saveConfig({...config,areas:a});
    setNewArea(""); showToast("✅ Área agregada");
  };
  const removeArea=(a)=>{
    saveConfig({...config,areas:areas.filter(x=>x!==a)});
  };

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {tabs.map((l,i)=>(
          <button key={i} onClick={()=>setCfgTab(i)}
            style={{padding:"9px 16px",borderRadius:10,border:`1.5px solid ${cfgTab===i?"#6c5ce7":"#e2e8f0"}`,background:cfgTab===i?"#1a2f4a":"#fff",color:cfgTab===i?"#fff":"#5a7a9a",cursor:"pointer",fontWeight:700,fontSize:12}}>
            {l}
          </button>
        ))}
      </div>

      {/* Tipos */}
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
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#1a2f4a"}}>{t.n}</div>
                  <div style={{fontSize:10,color:"#8aaabb"}}>HH est: {t.hEst}h</div>
                </div>
                <button onClick={()=>toggleTipo(t.id)}
                  style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${t.activo!==false?"#fecaca":"#bbf7d0"}`,background:t.activo!==false?"#fff1f2":"#f0fdf4",color:t.activo!==false?"#dc2626":"#16a34a",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  {t.activo!==false?"Ocultar":"Activar"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diseñadores */}
      {cfgTab===1&&(
        <DisenaoresPanel S={S} dis={dis} config={config} saveConfig={saveConfig} showNewD={showNewD} setShowNewD={setShowNewD} newDis={newDis} setNewDis={setNewDis} showToast={showToast}/>
      )}

      {/* Áreas */}
      {cfgTab===2&&(
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#1a2f4a",marginBottom:12}}>Áreas solicitantes</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={newArea} onChange={e=>setNewArea(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addArea()} placeholder="Nueva área..." style={{...S.inp,flex:1}}/>
            <button onClick={addArea} style={{padding:"10px 16px",borderRadius:9,border:"none",background:"#6c5ce7",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>Agregar</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {areas.map(a=>(
              <div key={a} style={{...S.card,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:600,fontSize:12,color:"#1a2f4a"}}>{a}</span>
                <button onClick={()=>removeArea(a)} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usuarios — nuevo panel que reemplaza la pestaña Accesos */}
      {cfgTab===3&&(
        <TabUsuarios S={S} showToast={showToast}/>
      )}
    </div>
  );
}
