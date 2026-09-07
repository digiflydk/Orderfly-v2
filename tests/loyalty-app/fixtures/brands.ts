'use server';
import {brand} from './data';
export async function getBrandById(id:string){return id==='b'?brand:null;}
