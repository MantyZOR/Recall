#![allow(dead_code)]
mod error {#[derive(Debug)]pub enum FSRSError{InvalidInput}pub type Result<T>=std::result::Result<T,FSRSError>;}
mod inference {
 #[derive(Clone,Copy)]pub struct MemoryState{pub stability:f32,pub difficulty:f32,pub stability_fast:f32}
 pub type Parameters=[f32];
 include!("../vendor/fsrs-rs/inference_v7.rs");
}
mod model {
 pub const S_MIN:f32=0.0001;pub const S_MAX:f32=36500.0;pub const D_MIN:f32=1.0;pub const D_MAX:f32=10.0;
 pub mod model_v7{include!("../vendor/fsrs-rs/model_v7.rs");}
}
use inference::MemoryState;
static mut WEIGHTS:[f32;34]=inference::DEFAULT_PARAMETERS;
static mut OUTPUT:MemoryState=MemoryState{stability:0.0,difficulty:0.0,stability_fast:0.0};
#[no_mangle]pub extern "C" fn set_parameter(i:u32,v:f32){if i<34{unsafe{WEIGHTS[i as usize]=v;}}}
#[no_mangle]pub extern "C" fn next(s:f32,d:f32,f:f32,t:f32,r:u32){
 let w=unsafe{WEIGHTS};let r=r.clamp(1,4) as usize;
 let result=if s<=0.0 {let s=w[r-1].clamp(0.0001,36500.0);MemoryState{stability:s,difficulty:model::model_v7::init_difficulty_scalar(&w,r).clamp(1.0,10.0),stability_fast:(s*0.8).clamp(0.0001,36500.0)}}else{model::model_v7::fsrs7_next_state_scalar(&w,MemoryState{stability:s.clamp(0.0001,36500.0),difficulty:d.clamp(1.0,10.0),stability_fast:f.clamp(0.0001,36500.0)},t,r)};
 unsafe{OUTPUT=result;}
}
#[no_mangle]pub extern "C" fn get_s()->f32{unsafe{OUTPUT.stability}}
#[no_mangle]pub extern "C" fn get_d()->f32{unsafe{OUTPUT.difficulty}}
#[no_mangle]pub extern "C" fn get_f()->f32{unsafe{OUTPUT.stability_fast}}
#[no_mangle]pub extern "C" fn recall(s:f32,d:f32,f:f32,t:f32)->f32{let w=unsafe{WEIGHTS};model::model_v7::fsrs7_forgetting_curve_scalar_for_state(&w,t,MemoryState{stability:s,difficulty:d,stability_fast:f})}
#[no_mangle]pub extern "C" fn interval(s:f32,d:f32,f:f32,r:f32)->f32{let w=unsafe{WEIGHTS};model::model_v7::fsrs7_next_interval_scalar_for_state(&w,MemoryState{stability:s,difficulty:d,stability_fast:f},r)}

