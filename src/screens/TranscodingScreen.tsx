import { useState, useEffect } from 'react';
import { getTranscodingSettings, updateTranscodingSettings } from '../api/transcoding';
import type { TranscodingSettings } from '../api/transcoding';
import { Icon } from '../components/Icon';

const QUALITY_LABEL: Record<string, string> = {
  P480: '480p',
  P720: '720p',
  P1080: '1080p',
};

const HWACCEL_LABEL: Record<string, string> = {
  NONE: 'None (CPU)',
  CUDA: 'CUDA (NVIDIA)',
  QSV: 'QSV (Intel)',
  VIDEOTOOLBOX: 'VideoToolbox (Apple)',
  V4L2M2M: 'V4L2 M2M',
  DRM: 'DRM',
};

function qualityLabel(q: string) {
  return QUALITY_LABEL[q] ?? q;
}

function hwAccelLabel(h: string) {
  return HWACCEL_LABEL[h] ?? h;
}

export function TranscodingScreen() {
  const [settings, setSettings] = useState<TranscodingSettings | null>(null);
  const [hwAccel, setHwAccel] = useState('');
  const [h264Encoder, setH264Encoder] = useState('');
  const [quality, setQuality] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    getTranscodingSettings()
      .then(s => {
        setSettings(s);
        setHwAccel(s.hwAccel);
        setH264Encoder(s.h264Encoder);
        setQuality(s.quality);
      })
      .catch(() => setError('트랜스코딩 설정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = settings !== null && (
    hwAccel !== settings.hwAccel ||
    h264Encoder !== settings.h264Encoder ||
    quality !== settings.quality
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await updateTranscodingSettings({ hwAccel, h264Encoder, quality });
      setSettings(updated);
      setHwAccel(updated.hwAccel);
      setH264Encoder(updated.h264Encoder);
      setQuality(updated.quality);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : '설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <style>{styles}</style>
      <div className="page-h">
        <div>
          <h1>트랜스코딩 설정</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-3)', fontSize: 13 }}>
            실시간 비디오 트랜스코딩에 사용할 하드웨어 가속, 인코더, 출력 품질을 설정합니다.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
          <Icon name="spinner" size={24} className="spin-icon" />
        </div>
      ) : error && !settings ? (
        <div style={{ color: 'var(--bad)', padding: 20 }}>{error}</div>
      ) : settings ? (
        <div className="tc-card">
          {settings && (
            <div className="tc-current">
              <div className="tc-current-label">현재 설정</div>
              <div className="tc-pills">
                <span className="pill info">{hwAccelLabel(settings.hwAccel)}</span>
                <span className="pill info mono">{settings.h264Encoder}</span>
                <span className="pill info">{qualityLabel(settings.quality)}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="tc-form-group">
              <label>하드웨어 가속 (HW Accel)</label>
              <p className="tc-desc">GPU를 사용해 트랜스코딩 속도를 높입니다. 지원되지 않는 가속기를 선택하면 오류가 발생할 수 있습니다.</p>
              <select value={hwAccel} onChange={e => setHwAccel(e.target.value)}>
                {settings.availableHwAccels.map(opt => (
                  <option key={opt} value={opt}>{hwAccelLabel(opt)}</option>
                ))}
              </select>
            </div>

            <div className="tc-form-group">
              <label>H.264 인코더</label>
              <p className="tc-desc">선택한 하드웨어 가속에 맞는 인코더를 선택하세요. 예: CUDA → H264_NVENC, CPU → LIBX264</p>
              <select value={h264Encoder} onChange={e => setH264Encoder(e.target.value)}>
                {settings.availableEncoders.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="tc-form-group">
              <label>출력 품질</label>
              <p className="tc-desc">트랜스코딩 결과물의 해상도를 지정합니다.</p>
              <div className="tc-quality-row">
                {settings.availableQualities.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={'tc-quality-btn' + (quality === opt ? ' on' : '')}
                    onClick={() => setQuality(opt)}
                  >
                    {qualityLabel(opt)}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="tc-status error">{error}</div>}
            {success && <div className="tc-status success">설정이 성공적으로 저장되었습니다.</div>}

            <div className="tc-actions">
              <button
                type="submit"
                className="btn primary"
                disabled={saving || !isDirty}
              >
                {saving ? (
                  <>
                    <Icon name="spinner" size={14} className="spin-icon" />
                    저장 중...
                  </>
                ) : '변경사항 저장'}
              </button>
              {isDirty && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setHwAccel(settings.hwAccel);
                    setH264Encoder(settings.h264Encoder);
                    setQuality(settings.quality);
                  }}
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const styles = `
  .tc-card {
    background: var(--bg-2);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 26px;
    max-width: 520px;
    margin-top: 20px;
    box-shadow: var(--shadow-sm);
    animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .tc-current {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 22px;
    margin-bottom: 24px;
    border-bottom: 1px solid var(--hairline);
    flex-wrap: wrap;
  }

  .tc-current-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--fg-3);
    white-space: nowrap;
  }

  .tc-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tc-form-group {
    margin-bottom: 22px;
  }

  .tc-form-group label {
    display: block;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--fg-2);
    margin-bottom: 4px;
  }

  .tc-desc {
    font-size: 12px;
    color: var(--fg-3);
    margin: 0 0 8px;
    line-height: 1.5;
  }

  .tc-form-group select {
    width: 100%;
    height: 42px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--fg);
    padding: 0 12px;
    font-size: 13.5px;
    font-family: inherit;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23929dae' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .tc-form-group select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .tc-quality-row {
    display: flex;
    gap: 8px;
  }

  .tc-quality-btn {
    flex: 1;
    height: 44px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--fg-3);
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tc-quality-btn:hover {
    background: var(--surface-2);
    color: var(--fg);
  }

  .tc-quality-btn.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .tc-status {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 18px;
  }

  .tc-status.success {
    background: rgba(46, 204, 113, 0.12);
    color: #27ae60;
    border: 1px solid rgba(46, 204, 113, 0.2);
  }

  .tc-status.error {
    background: rgba(231, 76, 60, 0.12);
    color: #c0392b;
    border: 1px solid rgba(231, 76, 60, 0.2);
  }

  .tc-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .tc-actions .btn.primary {
    flex: 1;
    height: 42px;
    font-weight: 600;
    justify-content: center;
  }
`;
