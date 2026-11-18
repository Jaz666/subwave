"""Verify the Library scan's stem options against an isolated working candidate.

Requires the verify stack on :7791/:7793, a stub analyzer reporting available,
and SUBWAVE_REGULAR_STEMS_ROLLOUT=working on that controller. Only reads real
controller state. The scan-start command is intercepted: no analysis is started.
Synthetic status responses cover the older audition UI and unavailable reads.
"""
import base64
import json
import os
from pathlib import Path
import urllib.request
from playwright.sync_api import sync_playwright, expect

API = 'http://localhost:7791'
WEB = 'http://localhost:7793'
AUTH = base64.b64encode(b'test:test').decode()


def api(endpoint):
    request = urllib.request.Request(API+endpoint, headers={'Authorization': 'Basic '+AUTH})
    return json.load(urllib.request.urlopen(request, timeout=10))


def checkbox(dialog, prefix):
    return dialog.get_by_role('checkbox').filter(has_text=prefix)


assert api('/stems/regular/status')['workingCache'] is True, 'requires isolated working candidate'
settings_before = api('/settings')
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for scenario in ['working', 'audition', 'loading', 'failed']:
        context = browser.new_context(viewport={'width': 1200, 'height': 1000})
        context.add_init_script(f"localStorage.setItem('subwave_admin_auth','{AUTH}')")
        page = context.new_page()
        commands = []
        pending_routes = []

        def capture(route):
            commands.append(route.request.post_data_json)
            route.fulfill(status=200, json={'ok': True})

        page.route('**/tag-library', capture)
        if scenario == 'audition':
            page.route('**/stems/regular/status', lambda route: route.fulfill(status=200, json={
                'audition': True, 'workingCache': False, 'trackLimit': 9, 'windows': []}))
        elif scenario == 'loading':
            page.route('**/stems/regular/status', lambda route: pending_routes.append(route))
        elif scenario == 'failed':
            page.route('**/stems/regular/status', lambda route: route.fulfill(status=503, json={'error': 'fixture outage'}))
        page.goto(WEB+'/admin/library', wait_until='domcontentloaded')
        page.get_by_role('button', name='Start tagging', exact=True).click()
        dialog = page.get_by_role('dialog', name='Tagging', exact=True)
        expect(dialog).to_be_visible()
        stem = checkbox(dialog, 'Prepare saved Sub/Beats stems' if scenario == 'working' else 'Prepare stems (regular + Sub/Beats)')
        if scenario in ('loading', 'failed'):
            expect(stem).to_be_disabled()
            expect(dialog).to_contain_text('unavailable' if scenario == 'failed' else 'Loading stem preparation options', timeout=15000)
            expect(dialog.get_by_role('button', name='Start', exact=True)).to_be_enabled()
            print('PASS', scenario, 'stem choices disabled; other scan steps available')
        else:
            expect(stem).to_be_enabled()
            for name in ['Reconcile with Navidrome', 'Enrich metadata', 'Tag moods (LLM)', 'Analyze acoustics']:
                control = checkbox(dialog, name)
                if control.get_attribute('aria-checked') == 'true':
                    control.click()
            stem.click()
            if scenario == 'working':
                expect(dialog).to_contain_text('Regular Stem Blends are prepared from the queue when needed.')
                expect(dialog).not_to_contain_text('Cache missing regular stems')
                output = os.environ.get('SUBWAVE_VERIFY_OUTPUT')
                if output:
                    Path(output).mkdir(parents=True, exist_ok=True)
                    dialog.screenshot(path=str(Path(output)/'regular-scan-desktop.png'))
                    page.set_viewport_size({'width':390,'height':844})
                    dialog.screenshot(path=str(Path(output)/'regular-scan-mobile.png'))
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile page overflows'
                    page.set_viewport_size({'width':1200,'height':1000})
                # A failed refetch must suppress a previously selected choice,
                # even though the query retains the last successful response.
                page.route('**/stems/regular/status', lambda route: route.fulfill(status=503, json={'error':'fixture outage'}))
                expect(stem).to_be_disabled(timeout=15000)
                expect(dialog.get_by_role('button',name='Start',exact=True)).to_be_disabled()
                page.unroute('**/stems/regular/status')
                expect(stem).to_be_enabled(timeout=15000)
            else:
                expect(dialog).to_contain_text('Cache missing regular stems')
            dialog.get_by_role('button',name='Start',exact=True).click()
            page.wait_for_function('document.querySelectorAll("[role=dialog]").length === 0')
            assert len(commands) == 1, commands
            body = commands[0]
            assert body['stems'] is True and body['analyze'] is False, body
            assert all(body[key] is False for key in ['reconcile','enrich','tagMoods','vocal']), body
            print('PASS', scenario, 'stem-only command preserves selection; stale reads cannot submit')
        assert len(commands) == (1 if scenario in ('working','audition') else 0)
        for route in pending_routes:
            route.abort()
        context.close()
    browser.close()
assert api('/settings') == settings_before, 'scan dialog changed saved settings'
print('PASS saved settings retained; no real scan command sent')
