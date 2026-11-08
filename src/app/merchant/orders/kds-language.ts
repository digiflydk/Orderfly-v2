'use client';
import { useSyncExternalStore } from 'react';
import english from './kds-english.json';
export type KdsLanguage = 'da' | 'en';
let language: KdsLanguage = 'da';
const listeners = new Set<() => void>();
export function setKdsLanguage(value: KdsLanguage) {language=value;try {localStorage.setItem('orderfly.kds.language',value);}catch{}listeners.forEach(fn=>fn());}
export function restoreKdsLanguage() {try {language=localStorage.getItem('orderfly.kds.language')==='en'?'en':'da';listeners.forEach(fn=>fn());}catch{}}
export function useKdsLanguage() {
 const value=useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},()=>language,()=> 'da' as KdsLanguage);
 const t=(text:string)=>value==='en'?(english as Record<string,string>)[text]??text:text;
 return {language:value,t,setLanguage:setKdsLanguage};
}
