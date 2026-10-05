import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    page=browser.new_page(viewport={"width":1440,"height":1100})
    errors=[]; requests=[]
    page.on("pageerror",lambda e: errors.append(str(e)))
    page.on("request",lambda r: requests.append(r.url))
    page.goto("http://127.0.0.1:8010/",wait_until="networkidle")
    page.locator("#customer-message").fill("No reconozco un cargo")
    page.locator("#send").click()
    expect(page.locator("#choices button")).to_have_count(2)
    page.locator("#choices button").first.click()
    expect(page.locator("#confirmation")).to_be_visible()
    expect(page.locator("#confirm-detail")).to_contain_text("120.00 USD")
    page.locator("#confirm").click()
    expect(page.locator("#customer-state")).to_have_text("En cola de revisión")
    expect(page.locator("#queue .case")).to_have_count(1)
    page.locator("#queue button").first.click()
    expect(page.locator("#facts")).to_contain_text("DEMO-TX-001")
    page.locator("#claim").click()
    expect(page.locator("#advisor-send")).to_be_enabled()
    page.locator("#advisor-message").fill("Recibí tu reporte y voy a investigar el cargo contigo.")
    page.locator("#advisor-send").click()
    expect(page.locator("#chat .human_agent")).to_contain_text("voy a investigar",timeout=10000)
    expect(page.locator("#customer-state")).to_have_text("Atiende un asesor")
    page.locator("#customer").select_option("local-client-pt")
    page.locator("#customer-message").fill("Não reconheço uma cobrança")
    page.locator("#send").click()
    expect(page.locator("#choices button")).to_have_count(1)
    expect(page.locator("#choices")).to_contain_text("Livraria do Bairro")
    expect(page.locator("#choices")).not_to_contain_text("Mercado Central")
    page.locator("#choices button").first.click()
    expect(page.locator("#confirm")).to_have_text("Confirmar e enviar para revisão")
    page.locator("#confirm").click()
    expect(page.locator("#chat")).to_contain_text("Sua solicitação está na fila")
    expect(page.locator("#queue .case")).to_have_count(2)
    page.locator("#customer").select_option("local-client-es")
    expect(page.locator("#chat .human_agent")).to_contain_text("voy a investigar")
    checks=[]
    for width in [375,414,768,1024,1440]:
        page.set_viewport_size({"width":width,"height":1100})
        dimensions=page.evaluate("({width:innerWidth, content:document.documentElement.scrollWidth})")
        assert dimensions["content"]<=dimensions["width"],dimensions
        checks.append({"width":width,"horizontal_overflow":False})
    page.screenshot(path="/tmp/local-dispute-demo-desktop.png",full_page=True)
    page.set_viewport_size({"width":375,"height":1100})
    page.screenshot(path="/tmp/local-dispute-demo-mobile.png",full_page=True)
    assert not errors,errors
    assert all(url.startswith("http://127.0.0.1:8010/") for url in requests),requests
    result={"browser":"Chrome headless", "customer_advisor_flow":"passed", "portuguese_flow":"passed", "customer_isolation":"passed", "responsive_checks":checks, "javascript_errors":errors, "external_requests":0}
    Path("/tmp/local-dispute-demo-browser-result.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))
    browser.close()
