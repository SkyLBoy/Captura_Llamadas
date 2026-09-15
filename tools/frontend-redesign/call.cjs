const fs=require('node:fs');const path='frontend/src/pages/MakeCall.tsx';let s=fs.readFileSync(path,'utf8');
s=s.replace("import { loadCallDraft", "import CallWorkspace from '../components/calls/CallWorkspace'\nimport { Feedback } from '../components/ui/Feedback'\nimport { Button } from '../components/ui/Button'\nimport { loadCallDraft");
for(const name of ['CallFormData','PhoneNumber','ContactDetail','SurveyData','Channel','CallAttempt'])s=s.replace(`type ${name} =`,`export type ${name} =`);
s=s.replace("const [channels, setChannels] = useState<Channel[]>([])","const [channels, setChannels] = useState<Channel[]>([])\n  const [dispositions, setDispositions] = useState<{ disposition_id: number; code: string; description: string }[]>([])\n  const [campaignName, setCampaignName] = useState('')");
s=s.replace('setSurveyData(result)','setCampaignName(campaign.name)\n        setSurveyData(result)');
s=s.replace('const [detail, catalog] = await Promise.all([','const [detail, catalog, campaigns] = await Promise.all([').replace('api.catalogs.getByCampaign(campaignId),','api.catalogs.getByCampaign(campaignId),\n          api.campaigns.getAll().catch(() => null),');
s=s.replace('setChannels(catalog.channels ?? [])',"setChannels((catalog.channels ?? []).filter((channel: Channel) => channel.is_active && channel.disposition_id !== null))\n          setDispositions(catalog.dispositions ?? [])\n          setCampaignName(campaigns?.campaigns?.find((item: { campaign_id: number }) => item.campaign_id === campaignId)?.name || '')");
// Preserve all API calls, idempotency, draft recovery and close payload construction above the UI.
s=s.slice(0,s.indexOf("  if (user && openAttemptStatus === 'loading')"));
s+=`  if (!user) return <Navigate to="/login" replace />
  if (openAttemptStatus === 'loading') return <Feedback>Comprobando si tienes una llamada abierta…</Feedback>
  if (openAttemptStatus === 'error') return <Feedback tone="error">No se pudo comprobar si tienes una llamada abierta. <Button onClick={() => setOpenAttemptRetry(value => value + 1)}>Reintentar</Button></Feedback>
  if (!state && !attempt) return <Feedback>Selecciona un contacto desde la lista para preparar una llamada. <Button onClick={() => navigate('/contactos')}>Ir a contactos</Button></Feedback>
  const ready = draftStatus === 'ready' && detailsStatus === 'ready' && surveyStatus === 'ready'
  const feedback = <>
    {detailsStatus === 'loading' && <Feedback>Cargando los datos y las canalizaciones…</Feedback>}
    {detailsStatus === 'error' && <Feedback tone="error">{detailsError} <Button onClick={() => setDetailsRetry(v => v + 1)}>Reintentar carga de datos</Button></Feedback>}
    {attempt && surveyStatus === 'loading' && <Feedback>Consultando la encuesta de la campaña…</Feedback>}
    {attempt && surveyStatus === 'error' && <Feedback tone="error">No se pudo consultar la encuesta. La llamada sigue abierta. <Button onClick={() => { setCloseError(null); setSurveyRetry(v => v + 1) }}>Reintentar consulta</Button></Feedback>}
    {attempt && draftStatus === 'loading' && <Feedback>Preparando la captura y comprobando el borrador…</Feedback>}
    {attempt && draftStatus === 'error' && <Feedback tone="error">{draftError} <Button onClick={() => setDraftRetry(v => v + 1)}>Reintentar recuperación</Button></Feedback>}
    {draftSaveError && <Feedback tone="warning">{draftSaveError} <Button disabled={isClosing} onClick={() => setDraftSaveRetry(v => v + 1)}>Reintentar guardado del borrador</Button></Feedback>}
  </>
  return <CallWorkspace
    attempt={attempt} detail={contactDetail} campaignName={campaignName} campaignId={attempt?.campaign_id ?? state?.campaignId} state={state}
    contactId={selectedContactPersonId} phone={selectedPhone} selectContact={handleSelectContactPerson} selectPhone={handleSelectPhone}
    start={handleStartCall} pendingStart={pendingStart.current !== null} starting={isCalling} startError={callError}
    survey={surveyData} completed={surveyCompleted} setCompleted={setSurveyCompleted} declined={surveyDeclined} setDeclined={setSurveyDeclined}
    answers={surveyAnswers} setAnswers={setSurveyAnswers} errors={surveyErrors} setErrors={setSurveyErrors}
    channels={channels} dispositions={dispositions} channelCode={selectedChannelCode} selectChannel={handleSelectChannel}
    notes={notes} setNotes={setNotes} newPhone={newDataPhone} setNewPhone={setNewDataPhone} newEmail={newDataEmail} setNewEmail={setNewDataEmail} newBusiness={newDataBusinessName} setNewBusiness={setNewDataBusinessName}
    close={handleCloseCall} closing={isClosing} closeError={closeError} ready={ready} detailsReady={detailsStatus === 'ready'} elapsed={elapsedSeconds} feedback={feedback} draftSaveError={draftSaveError}
  />
}
export default MakeCall
`;
fs.writeFileSync(path,s);
