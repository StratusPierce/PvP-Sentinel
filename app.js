import 'dotenv/config';
import express from 'express'; import session from 'express-session'; import http from 'http'; import { Server } from 'socket.io';
import { client, startBot } from './bot/index.js'; import { db, getSettings, saveSettings, event, settingsDefaults } from './shared/db.js';
const app=express(), server=http.createServer(app), io=new Server(server); const cfg=process.env;
app.set('view engine','ejs');app.set('views','web/views');app.use(express.urlencoded({extended:true}));app.use(express.json());app.use(session({secret:cfg.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{sameSite:'lax',secure:false}}));app.use('/static',express.static('web/public'));
function authed(req,res,next){if(!req.session.user)return res.redirect('/login');next()}
async function guilds(token){const r=await fetch('https://discord.com/api/users/@me/guilds',{headers:{Authorization:`Bearer ${token}`}});return r.ok?r.json():[]}
function canManage(g){return (BigInt(g.permissions)&0x20n)!==0n||(BigInt(g.permissions)&0x8n)!==0n}
app.get('/',(req,res)=>res.render('home',{user:req.session.user}));
app.get('/login',(req,res)=>res.redirect(`https://discord.com/oauth2/authorize?client_id=${cfg.CLIENT_ID}&redirect_uri=${encodeURIComponent(cfg.PUBLIC_URL+'/auth/callback')}&response_type=code&scope=identify%20guilds`));
app.get('/auth/callback',async(req,res)=>{const body=new URLSearchParams({client_id:cfg.CLIENT_ID,client_secret:cfg.CLIENT_SECRET,grant_type:'authorization_code',code:req.query.code,redirect_uri:cfg.PUBLIC_URL+'/auth/callback'});const r=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const t=await r.json();if(!t.access_token)return res.status(401).send('Discord login failed.');const u=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${t.access_token}`}}).then(x=>x.json());req.session.user=u;req.session.token=t.access_token;res.redirect('/dashboard')});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.get('/dashboard',authed,async(req,res)=>{const gs=(await guilds(req.session.token)).filter(canManage);res.render('dashboard',{user:req.session.user,guilds:gs,selected:req.query.guild||cfg.GUILD_ID,settings:getSettings(req.query.guild||cfg.GUILD_ID),events:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 40').all()})});
app.post('/dashboard/settings',authed,(req,res)=>{saveSettings(req.body.guild,req.body);event(req.body.guild,'DASHBOARD',req.session.user.id,`Settings updated by ${req.session.user.username}`);io.emit('event',{type:'DASHBOARD',message:'Dashboard settings updated'});res.redirect('/dashboard?guild='+req.body.guild)});
app.post('/api/minecraft/event',(req,res)=>{if(req.get('x-bridge-secret')!==cfg.BRIDGE_SECRET)return res.sendStatus(403);const x=req.body;event(cfg.GUILD_ID,'MINECRAFT_'+(x.type||'event').toUpperCase(),x.player||'server',x.message||JSON.stringify(x));io.emit('event',{type:'MINECRAFT',player:x.player,message:x.message});res.json({ok:true})});
io.on('connection',s=>s.emit('hello',{connected:client.isReady()}));
startBot(io);server.listen(cfg.PORT||3000,()=>console.log(`Dashboard: ${cfg.PUBLIC_URL}`));
