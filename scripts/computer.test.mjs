import test from "node:test";
import assert from "node:assert/strict";
import { validateAction } from "../electron/desktop.ts";
import { toolAllowed } from "../src/lib/kernel/modes.ts";
test("Chat cannot use tools; research is read-only", () => {
 for (const name of ["plan","desktop_click","write_file","run_command","web_search"]) assert.equal(toolAllowed("chat",name,true),false);
 assert.equal(toolAllowed("research","web_search",false),true);
 assert.equal(toolAllowed("research","write_file",true),false);
 assert.equal(toolAllowed("research","desktop_inspect",true),false);
});
test("Computer tools require desktop", () => {
 assert.equal(toolAllowed("computer","desktop_click",false),false);
 assert.equal(toolAllowed("computer","run_command",false),false);
 assert.equal(toolAllowed("computer","desktop_click",true),true);
});
test("App launch is allowlisted", () => {
 assert.deepEqual(validateAction({action:"launch",app:"notepad"}),{action:"launch",app:"notepad"});
 for(const app of ["cmd","notepad; calc","../cmd.exe"]) assert.throws(()=>validateAction({action:"launch",app}));
});
test("Controls require valid observed identifiers", () => {
 assert.throws(()=>validateAction({action:"click",window:0,element:"1,2"}));
 assert.throws(()=>validateAction({action:"click",window:12,element:"1;evil"}));
 assert.throws(()=>validateAction({action:"inspect",window:-1}));
 assert.deepEqual(validateAction({action:"click",window:12,element:"42,-1,9"}),{action:"click",window:12,element:"42,-1,9"});
});
test("Text is literal and bounded; shortcuts are allowlisted", () => {
 const text="' ; $(Remove-Item x) {ENTER}";
 assert.equal(validateAction({action:"type",window:12,element:"1,2",text}).text,text);
 assert.throws(()=>validateAction({action:"type",window:12,element:"1,2",text:"x".repeat(10001)}));
 assert.throws(()=>validateAction({action:"key",window:12,key:"%{F4}"}));
 assert.deepEqual(validateAction({action:"key",window:12,key:"CTRL+S"}),{action:"key",window:12,key:"CTRL+S"});
});
