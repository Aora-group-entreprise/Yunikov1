import { z } from "zod";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const SessionSchema = z.object({ userId:z.string().uuid(),sessionId:z.string().uuid(),accessToken:z.string().min(20) });
const RegisterSchema = z.object({ email:z.string().email(),password:z.string().min(8),username:z.string().regex(/^[A-Za-z0-9_]{3,32}$/) });
const LoginSchema = z.object({ identifier:z.string().min(1),password:z.string().min(1) });

async function request(path:string,body:unknown){const response=await fetch(`${API_BASE}${path}`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof data.error==="string"?data.error:"request_failed");return data;}
export async function register(input:z.infer<typeof RegisterSchema>){const data=await request("/auth/register",RegisterSchema.parse(input));return SessionSchema.parse(data);}
export async function login(input:z.infer<typeof LoginSchema>){const data=await request("/auth/login",LoginSchema.parse(input));return SessionSchema.parse(data);}
export async function refresh(){const data=await request("/auth/refresh",{});return SessionSchema.parse(data);}
export async function logout(scope:"current"|"all"="current"){await request("/auth/logout",{scope});}
export async function requestPasswordReset(identifier:string){await request("/auth/password-reset",{identifier});}
