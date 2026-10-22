import { test } from "node:test";
import assert from "node:assert/strict";
import { createXlsxWorkbook, readXlsxSheets, readXlsx, WorkbookError } from "../lib/bulk/xlsx";
import { combineSelectedSheets } from "../lib/bulk/sheet-selection";

test("reads every sheet by its workbook name while retaining single-sheet compatibility", () => {
  const workbook=createXlsxWorkbook([
    {name:"October",headers:["Owner","Date"],rows:[["A","22/10/2026"]]},
    {name:"November",headers:["Date","Owner"],rows:[["23/11/2026","B"]]},
  ]);
  const sheets=readXlsxSheets(workbook);
  assert.deepEqual(sheets.map(s=>s.name),["October","November"]);
  assert.deepEqual(sheets[1].headers,["Date","Owner"]);
  assert.deepEqual(readXlsx(workbook),{headers:["Owner","Date"],rows:[["A","22/10/2026"]]});
  const selected=combineSelectedSheets(sheets,["October","November"]);
  assert.deepEqual(selected.issues,[]);
  assert.deepEqual(selected.sheet?.rows,[["A","22/10/2026"],["B","23/11/2026"]]);
  assert.deepEqual(selected.sources,[{name:"October",position:1},{name:"November",position:1}]);
});

test("prevents combining sheets with different column sets", () => {
  const sheets=readXlsxSheets(createXlsxWorkbook([
    {name:"Correct",headers:["Owner","Date"],rows:[["A","22/10/2026"]]},
    {name:"Wrong",headers:["Owner","Value"],rows:[["B","100"]]},
  ]));
  const selected=combineSelectedSheets(sheets,["Correct","Wrong"]);
  assert.equal(selected.sheet,null);
  assert.match(selected.issues.join(" "),/Wrong.*same columns.*Correct.*missing: date.*extra: value/i);
  assert.deepEqual(combineSelectedSheets(sheets,["Wrong"]).sheet?.rows,[["B","100"]]);
});

test("selection requires a worksheet and limits total across all chosen sheets to 100",()=>{
  const sheets=readXlsxSheets(createXlsxWorkbook([
    {name:"A",headers:["Owner"],rows:Array.from({length:60},(_,i)=>["A"+i])},
    {name:"B",headers:["Owner"],rows:Array.from({length:50},(_,i)=>["B"+i])},
  ]));
  assert.match(combineSelectedSheets(sheets,[]).issues[0],/Choose/);
  const selected=combineSelectedSheets(sheets,["A","B"]);
  assert.equal(selected.sheet,null);
  assert.match(selected.issues.join(" "),/110.*maximum is 100/i);
  assert.equal(combineSelectedSheets(sheets,["A"]).sheet?.rows.length,60);
});

test("blank and incompatible sheet selections cannot issue certificates",()=>{
  const sheets=readXlsxSheets(createXlsxWorkbook([
    {name:"Data",headers:["Owner"],rows:[["A"]]},
    {name:"Empty",headers:["Owner"],rows:[]},
  ]));
  assert.equal(combineSelectedSheets(sheets,["Data","Empty"]).sheet?.rows.length,1);
  assert.equal(combineSelectedSheets(sheets,["Empty"]).sheet,null);
  assert.throws(()=>readXlsxSheets(createXlsxWorkbook([
    {name:"Dup",headers:["Owner"],rows:[["A"]]},
    {name:"dup",headers:["Owner"],rows:[["B"]]},
  ])),WorkbookError);
});
