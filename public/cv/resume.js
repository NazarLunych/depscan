// Integration around the unmodified Mozilla PDF.js generic viewer (Apache-2.0).
(() => {
  const params = new URLSearchParams(location.search)
  const token = params.get('ref') || '00000000000000000000000000000002'
  const enabled = navigator.doNotTrack !== '1' && /^[a-f0-9]{32}$/.test(token)
  const test = params.get('monitor_test') === '1'
  const sent = new Set()
  const frame = document.getElementById('resume')
  let loaded = false
  let page = 1
  let visibleSeconds = 0
  const send = (type) => {
    if (!enabled || sent.has(type)) return
    sent.add(type)
    fetch('https://nazarii-job-signals.nazariy-lunich.workers.dev/events', {
      method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token, type, test }), signal: AbortSignal.timeout(10000),
    }).catch(() => {})
  }
  document.getElementById('download').addEventListener('click', () => send('cv_download'))
  document.addEventListener('webviewerloaded', async (event) => {
    const win = event.detail.source
    win.PDFViewerApplicationOptions.set('disablePreferences', true)
    win.PDFViewerApplicationOptions.set('enableScripting', false)
    win.PDFViewerApplicationOptions.set('annotationEditorMode', -1)
    win.PDFViewerApplicationOptions.set('externalLinkTarget', 2)
    const app = win.PDFViewerApplication
    await app.initializedPromise
    app.eventBus.on('pagerendered', ({ pageNumber }) => {
      if (!loaded) { loaded = true; send('cv_loaded') }
      if (pageNumber === page && !document.hidden) send('cv_page_' + page)
    })
    app.eventBus.on('pagechanging', ({ pageNumber }) => {
      page = pageNumber
      if (loaded && !document.hidden) send('cv_page_' + page)
    })
    win.document.addEventListener('click', (e) => {
      if (!e.isTrusted || !(e.target instanceof win.Element)) return
      if (e.target.closest('#downloadButton, #secondaryDownload')) send('cv_download')
      if (e.target.closest('#printButton, #secondaryPrint')) send('cv_print')
      const anchor = e.target.closest('.annotationLayer a[href]')
      if (!anchor) return
      const url = new URL(anchor.href)
      let kind = 'other'
      if (url.hostname === 'github.com') kind = 'github'
      if (url.hostname.endsWith('linkedin.com')) kind = 'linkedin'
      if (url.hostname === 'depscan-nine.vercel.app') {
        kind = 'demo'
        url.searchParams.set('ref', token)
        if (test) url.searchParams.set('monitor_test', '1')
        anchor.href = url.href
      }
      if (url.protocol === 'mailto:') kind = 'email'
      send('cv_link_' + kind)
    }, true)
  })
  document.addEventListener('visibilitychange', () => {
    if (loaded && !document.hidden) send('cv_page_' + page)
  })
  setInterval(() => {
    if (!loaded || document.hidden) return
    visibleSeconds++
    if ([15, 30, 60, 120].includes(visibleSeconds)) send('cv_visible_' + visibleSeconds + 's')
  }, 1000)
  frame.src = '/cv/vendor/web/viewer.html?file=%2Fcv%2FNazarii_Lunych_React_CV.pdf#zoom=page-width'
})()
