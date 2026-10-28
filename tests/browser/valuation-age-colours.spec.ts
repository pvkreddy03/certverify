import {test, expect} from "@playwright/test";

test.beforeEach(async ({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});

function monthsAgo(months:number){
  const today=new Date();
  // Set to the 15th first, so subtracting a month cannot roll over at month-end.
  today.setDate(15);
  today.setMonth(today.getMonth()-months);
  return [
    today.getFullYear(),
    String(today.getMonth()+1).padStart(2,"0"),
    String(today.getDate()).padStart(2,"0"),
  ].join("-");
}

test("reference map renders accessible age-coloured pins and filters historical valuations",async({page})=>{
  await page.addInitScript(()=>{
    class FakeMap {
      container:HTMLElement;
      constructor(options:{container:HTMLElement}){this.container=options.container;}
      addControl(){}
      on(){}
      flyTo(){}
      remove(){this.container.replaceChildren();}
    }
    class FakeMarker {
      element:HTMLElement;
      constructor(options?:{element?:HTMLElement}){
        this.element=options?.element??document.createElement("span");
      }
      setLngLat(){return this;}
      addTo(map:FakeMap){map.container.appendChild(this.element);return this;}
    }
    Object.defineProperty(window,"maplibregl",{value:{
      Map:FakeMap,Marker:FakeMarker,NavigationControl:class {},
    },configurable:true});
  });
  const records=[
    {certificate_id:"CV-NEW",valuation_date:monthsAgo(2),lat:17.49,lng:78.39},
    {certificate_id:"CV-MIDDLE",valuation_date:monthsAgo(8),lat:17.50,lng:78.40},
    {certificate_id:"CV-YEAR",valuation_date:monthsAgo(18),lat:17.51,lng:78.41},
    {certificate_id:"CV-OLD",valuation_date:monthsAgo(30),lat:17.52,lng:78.42},
    {certificate_id:"CV-UNKNOWN",valuation_date:null,lat:17.53,lng:78.43},
  ].map((item,index)=>({
    ...item,
    id:"20000000-0000-0000-0000-00000000000"+(index+1),
    template_name:"Property valuation",
    created_at:new Date().toISOString(),
    status:"Active",price_per_sq_meter:null,total_property_value:null,
    field_name:"Property location",label:"Kukatpally",
  }));

  await page.route("**/api/geo/references",async route=>{
    expect(route.request().headers()["authorization"]).toMatch(/^Bearer /);
    expect(route.request().headers()["x-certverify-account"]).toBeTruthy();
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({points:records})});
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|\?|$)/);
  await page.goto("/dashboard/reference-map");

  const legend=page.getByRole("region",{name:"Valuation age colour legend"});
  await expect(legend.getByRole("button",{name:"All ages · 5"})).toBeVisible();
  for(const [label,color,certificate] of [
    ["Under 6 months","rgb(21, 128, 61)","CV-NEW"],
    ["6–12 months","rgb(217, 119, 6)","CV-MIDDLE"],
    ["1–2 years","rgb(37, 99, 235)","CV-YEAR"],
    ["Older than 2 years","rgb(220, 38, 38)","CV-OLD"],
    ["Date unavailable","rgb(100, 116, 139)","CV-UNKNOWN"],
  ]){
    await expect(legend.getByRole("button",{name:new RegExp(label)})).toBeVisible();
    await expect(page.getByRole("button",{name:"Open "+certificate+" — "+label})).toHaveCSS("background-color",color);
  }
  await legend.getByRole("button",{name:"Older than 2 years · 1"}).click();
  await expect(page.getByText("1 location records in view")).toBeVisible();
  await expect(page.getByRole("button",{name:"Open CV-OLD — Older than 2 years"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Open CV-NEW/})).toHaveCount(0);
  await legend.getByRole("button",{name:"Date unavailable · 1"}).click();
  await expect(page.getByRole("button",{name:"Open CV-UNKNOWN — Date unavailable"})).toBeVisible();
  await expect(page.getByText("Valuation: Not recorded")).toBeVisible();
  await legend.getByRole("button",{name:"All ages · 5"}).click();
  await expect(page.getByRole("button",{name:/Open CV-NEW/})).toBeVisible();
});
