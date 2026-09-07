'use client';
import {createContext,useContext} from 'react';
import {brand} from './data';
const noop=()=>{};
const base:any={brand,cartItems:[{id:'p',cartItemId:'line',productName:'QA Pizza',categoryId:'pizza',itemType:'product',price:100,basePrice:100,quantity:1,toppings:[],tags:[],imageUrl:'/pixel.svg'}],subtotal:100,checkoutTotal:100,itemDiscount:0,cartDiscount:null,voucherDiscount:null,freeDeliveryDiscountApplied:false,deliveryFee:0,adminFee:0,vatAmount:20,deliveryType:'pickup',itemCount:1,bagFee:0,includeBagFee:false,selectedTime:'asap',applyDiscount:noop,removeDiscount:noop,setCartContext:noop,setSelectedTime:noop,toggleBagFee:noop};
const Context=createContext(base);
export function FixtureCart({children,blocked=false}:{children:React.ReactNode;blocked?:boolean}){return <Context.Provider value={blocked?{...base,checkoutTotal:90,cartDiscount:{name:'Automatic offer',amount:10}}:base}>{children}</Context.Provider>;}
export const useCart=()=>useContext(Context);
