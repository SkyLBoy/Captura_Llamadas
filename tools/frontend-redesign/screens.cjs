const fs=require('node:fs');
let p='frontend/src/pages/ContactList.tsx',s=fs.readFileSync(p,'utf8');
s=s.replace('useState, useEffect','useState, useEffect, useRef').replace("import { useAuth", "import SearchInput from '../components/ui/SearchInput'\nimport { useAuth");
s=s.replace("const [searchTerm, setSearchTerm] = useState('')", "const [searchTerm, setSearchTerm] = useState('')\n  const [page, setPage] = useState(1)\n  const requestId = useRef(0)");
s=s.replace("const result = await executeApiCall(() =>\n    api.contacts.getAvailable(campaignId)\n  )", "const currentRequest = ++requestId.current\n  const result = await executeApiCall(() => api.contacts.getAvailable(campaignId))");
// CRLF-safe replacement for the existing request block.
s=s.replace(/const result = await executeApiCall\(\(\) =>\s*api.contacts.getAvailable\(campaignId\)\s*\)/, "const currentRequest = ++requestId.current\n  const result = await executeApiCall(() => api.contacts.getAvailable(campaignId))");
s=s.replace('if (result) {\n    setContacts', 'if (result && currentRequest === requestId.current) {\n    setContacts').replace('if (result) {\r\n    setContacts', 'if (result && currentRequest === requestId.current) {\r\n    setContacts');
s=s.replace("setSelectedCampaignId(campaignId)","requestId.current += 1\n    setPage(1)\n    setSelectedCampaignId(campaignId)");
s=s.replace('setSearchTerm(e.target.value)','setPage(1)\n    setSearchTerm(e.target.value)');
s=s.replace('contact.clave.toLowerCase()',"String(contact.clave || '').toLowerCase()");
s=s.replace('<div className="space-y-6">','<div className="space-y-6"><div className="page-heading"><div className="eyebrow">Espacio del agente</div><h1>Tu próxima conversación.</h1><p>Elige una campaña y prepara el contacto que vas a llamar.</p></div>');
s=s.replace('Seleccione una campaña</h2>','Campaña de trabajo</h2>');
s=s.replace(/<input\s+type="text"\s+placeholder="Buscar por clave o razón social"/, '<SearchInput aria-label="Buscar por clave o razón social" onClear={() => { setSearchTerm(\'\'); setPage(1) }} placeholder="Buscar por clave o razón social"');
s=s.replace('{filteredContacts.map((contact)', '{filteredContacts.slice((page - 1) * 25, page * 25).map((contact)');
s=s.replace('            {filteredContacts.length > 0 ? (', '            <p className="small mb-4" role="status">{loading ? \'Consultando contactos…\' : `${filteredContacts.length} contactos disponibles`}</p>\n            {filteredContacts.length > 0 ? (');
s=s.replace('loadingDetail || ', 'loading || loadingDetail || ');
s=s.replace('          </div>\n        </>','          <div className="call-actions"><button disabled={page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span className="small">Página {page} de {Math.max(1, Math.ceil(filteredContacts.length / 25))}</span><button disabled={page * 25 >= filteredContacts.length} onClick={() => setPage(v => v + 1)}>Siguiente</button></div></div>\n        </>');
fs.writeFileSync(p,s);
p='frontend/src/pages/admin/WorkRounds.tsx';s=fs.readFileSync(p,'utf8').replace("import { useAuth", "import { useConfirm } from '../../components/ui/ConfirmProvider'\nimport { useAuth").replace("const { user } = useAuth()", "const { user } = useAuth()\n  const confirm = useConfirm()");
s=s.replace('const confirmed = window.confirm(', "startInFlight.current = true\n    const confirmed = await confirm({ title: 'Habilitar ronda de trabajo', action: 'Habilitar ronda', message:");
s=s.replace("'Se finalizará la ronda actual, si existe. El historial se conservará.'\r\n    )", "'Se finalizará la ronda actual, si existe. El historial se conservará.'\n    })").replace("'Se finalizará la ronda actual, si existe. El historial se conservará.'\n    )", "'Se finalizará la ronda actual, si existe. El historial se conservará.'\n    })");
s=s.replace('if (!confirmed) return', 'if (!confirmed) { startInFlight.current = false; return }');fs.writeFileSync(p,s);
p='frontend/src/pages/admin/FinalizedContacts.tsx';s=fs.readFileSync(p,'utf8').replace("import { useAuth", "import SearchInput from '../../components/ui/SearchInput'\nimport { useAuth");
s=s.replace('<label>Buscar por clave o razón social', '<div><label htmlFor="finalized-search">Buscar por clave o razón social</label>').replace('<input className="mt-2 block w-full rounded border p-3" value={search}', '<SearchInput id="finalized-search" onClear={() => { setSearch(\'\'); setPage(1) }} className="mt-2 block w-full rounded border p-3" value={search}');
s=s.replace('onChange={event => { setSearch(event.target.value); setPage(1) }} />\n      </label>', 'onChange={event => { setSearch(event.target.value); setPage(1) }} />\n      </div>').replace('onChange={event => { setSearch(event.target.value); setPage(1) }} />\r\n      </label>', 'onChange={event => { setSearch(event.target.value); setPage(1) }} />\r\n      </div>');fs.writeFileSync(p,s);
p='frontend/src/pages/admin/Blacklist.tsx';s=fs.readFileSync(p,'utf8').replace("import { useAuth", "import { useConfirm } from '../../components/ui/ConfirmProvider'\nimport { useAuth").replace("const { user } = useAuth()", "const { user } = useAuth()\n  const confirm = useConfirm()");
s=s.replace('const handleRelease = async (blacklistId: number) => {',"const handleRelease = async (blacklistId: number) => {\n    const item = blacklist.find(item => item.blacklist_id === blacklistId)\n    if (!await confirm({ title: 'Liberar contacto de Blacklist', message: `Se retirará el bloqueo de ${item?.razon_social || item?.clave || 'este contacto'}. Los demás criterios de elegibilidad de la campaña siguen aplicando.`, action: 'Liberar contacto' })) return");
s=s.replace('onClick={() => handleRelease(item.blacklist_id)}','disabled={loading}\n                        onClick={() => handleRelease(item.blacklist_id)}');fs.writeFileSync(p,s);
p='frontend/src/pages/admin/UserList.tsx';s=fs.readFileSync(p,'utf8');s=s.replace(/\{\/\* Aquí irían los botones de editar\/eliminar \*\/\}[\s\S]*?(?=\s*<\/td>)/,'<span className="small">Solo consulta</span>');fs.writeFileSync(p,s);
// Reports already owns its domain validation; disabling browser bubbles preserves it.
// Auth startup no longer renders a blank page.
p='frontend/src/contexts/AuthContext.tsx';s=fs.readFileSync(p,'utf8').replace('return null','return <div className="app-main" role="status">Comprobando tu sesión…</div>');fs.writeFileSync(p,s);
