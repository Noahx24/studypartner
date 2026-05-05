import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { downloadAndStorePack, usePackStatus } from '../hooks/usePack';
import { packsRepo } from '../db/repos';
import { Card, Chip, ProgressRing, Screen, ScreenHeader, SectionLabel, } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO } from '../ui/tokens';
export function StudyPacksView({ userId, moduleId, activeSelectionId, onBack, onOpenPack, }) {
    const [packs, setPacks] = useState([]);
    const [activePackId, setActivePackId] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(null);
    const [generating, setGenerating] = useState(false);
    const { status } = usePackStatus(activePackId);
    useEffect(() => {
        let cancelled = false;
        api
            .listPacks(moduleId, userId)
            .then((res) => !cancelled && setPacks(res.packs))
            .catch((err) => !cancelled &&
            setError(err instanceof Error ? err.message : 'Failed to list packs'));
        return () => {
            cancelled = true;
        };
    }, [moduleId, userId, status?.status]);
    const generate = async () => {
        if (!activeSelectionId) {
            setError('Save a selection first');
            return;
        }
        setGenerating(true);
        setError(null);
        try {
            const res = await api.generatePack({
                user_id: userId,
                selection_id: activeSelectionId,
            });
            setActivePackId(res.pack_id);
            await packsRepo.upsertMeta({
                id: res.pack_id,
                module_id: moduleId,
                user_id: userId,
                selection_id: activeSelectionId,
                status: 'generating',
                version: 1,
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to generate pack');
        }
        finally {
            setGenerating(false);
        }
    };
    const openPack = async (pack_id) => {
        setError(null);
        setDownloading(true);
        try {
            const payload = await downloadAndStorePack(pack_id);
            onOpenPack(pack_id, payload);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
        }
        finally {
            setDownloading(false);
        }
    };
    const isBuildingNow = generating ||
        (activePackId !== null &&
            (status?.status === 'generating' || status?.status === undefined));
    return (<Screen>
      <ScreenHeader subtitle="OFFLINE READY" title="Study packs" right={<button onClick={onBack} className="text-[13px] font-semibold text-ink2">
            Back
          </button>}/>

      <div className="px-4">
        {error && (<div className="mb-3 rounded-[12px] px-3 py-2 text-sm" style={{ background: P.coralSoft, color: P.coralDeep }}>
            {error}
          </div>)}

        {/* Generate hero */}
        {isBuildingNow ? (<Card variant="dark" pad={0}>
            <div className="flex items-center gap-4 p-[18px]">
              <div className="sp-spin">
                <ProgressRing value={0.25} size={52} stroke={5} color={P.lime} trackColor="rgba(255,255,255,0.15)"/>
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-white">Building pack…</div>
                <div className="mono mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>
                  AI summaries + quizzes · about 20s
                </div>
              </div>
            </div>
          </Card>) : (<Card variant="tinted" style={{ background: P.lime }}>
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: P.limeInk }}>
                <Icon name="sparkles" size={20} color={P.lime}/>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold" style={{ color: P.limeInk }}>
                  Generate a new pack
                </div>
                <div className="mono mt-0.5 text-[12px]" style={{ color: P.limeInk, opacity: 0.7, fontFamily: MONO }}>
                  {activeSelectionId ? 'Ready to build' : 'Plan a selection first'}
                </div>
              </div>
              <button onClick={generate} disabled={!activeSelectionId} className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold disabled:opacity-40" style={{ background: P.limeInk, color: P.lime }}>
                Start
              </button>
            </div>
          </Card>)}

        <SectionLabel title="Your packs"/>
        {packs.length === 0 ? (<Card>
            <p className="text-sm text-ink3">No packs yet. Generate one above.</p>
          </Card>) : (<div className="flex flex-col gap-2.5">
            {packs.map((p) => (<PackRow key={p.id} pack={p} onOpen={() => openPack(p.id)} busy={downloading}/>))}
          </div>)}
      </div>
    </Screen>);
}
function PackRow({ pack, onOpen, busy, }) {
    const sizeKB = pack.byte_size ? Math.round(pack.byte_size / 1024) : 0;
    const stamp = pack.generated_at
        ? new Date(pack.generated_at).toLocaleString()
        : '—';
    return (<Card pad={14}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: P.primarySoft, color: P.primary }}>
          <Icon name="pack" size={18} color={P.primary}/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">
              Pack v{pack.version}
            </span>
            <Chip tone={pack.status === 'generated'
            ? 'ok'
            : pack.status === 'failed'
                ? 'risk'
                : 'primary'}>
              {pack.status}
            </Chip>
          </div>
          <div className="mono mt-0.5 text-[11px] text-ink3" style={{ fontFamily: MONO }}>
            {sizeKB ? `${sizeKB} KB · ` : ''}
            {stamp}
          </div>
        </div>
        {pack.status === 'generated' && (<button disabled={busy} onClick={onOpen} className="btn-secondary text-[12px]" style={{ padding: '8px 12px' }}>
            <Icon name="download" size={13}/>
            {busy ? 'Opening…' : 'Open'}
          </button>)}
      </div>
    </Card>);
}
