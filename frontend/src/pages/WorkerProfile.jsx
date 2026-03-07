import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useScroll, useInView } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { submitWorkerProfile, getMLScore } from '../api';
import './WorkerProfile.css';

gsap.registerPlugin(ScrollTrigger);

/* ---------- Background particles ---------- */
function BgParticles({ count = 250, mouse }) {
  const mesh = useRef();
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 18;
      p[i * 3 + 1] = (Math.random() - 0.5) * 18;
      p[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return p;
  }, [count]);
  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.rotation.y = state.clock.elapsedTime * 0.015 + (mouse.current?.[0] || 0) * 0.08;
    mesh.current.rotation.x = state.clock.elapsedTime * 0.008;
  });
  return (
    <points ref={mesh}>
      <bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} /></bufferGeometry>
      <pointsMaterial size={0.035} color="#ff3d5a" transparent opacity={0.4} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  );
}

function FloatingShape({ position, color = '#a855f7', scale = 0.3 }) {
  const ref = useRef();
  const speed = useMemo(() => 0.2 + Math.random() * 0.4, []);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = position[1] + Math.sin(t * speed) * 0.6;
    ref.current.rotation.x = t * speed;
    ref.current.rotation.z = t * speed * 0.5;
  });
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={color} wireframe transparent opacity={0.3} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

/* ---------- 3D Tilt wrapper ---------- */
function TiltCard({ children, className }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 });
  const handleMouse = useCallback((e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);
  const handleLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);
  return (
    <motion.div ref={ref} className={className} onMouseMove={handleMouse} onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800, transformStyle: 'preserve-3d' }}>
      {children}
    </motion.div>
  );
}

const CITIES = [
  'Pune', 'Hyderabad', 'Mumbai', 'Bangalore', 'Chennai', 'Delhi',
  'Gurgaon', 'Noida', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Chandigarh', 'Indore', 'Kochi', 'Nagpur', 'Bhopal', 'Coimbatore',
  'Visakhapatnam', 'Thiruvananthapuram',
];

export default function WorkerProfile() {
  const [form, setForm] = useState({ jobTitle: '', city: '', yearsOfExperience: '', writeUp: '' });
  const [result, setResult] = useState(null);
  const [mlScore, setMlScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mouse = useRef([0, 0]);
  const pageRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const bgY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  useEffect(() => {
    const h = (e) => { mouse.current = [(e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1]; };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.worker-hero h1', { y: 60, opacity: 0, duration: 0.8, ease: 'power3.out' });
      gsap.from('.worker-hero p', { y: 30, opacity: 0, duration: 0.6, delay: 0.2, ease: 'power3.out' });
      gsap.from('.form-group', { y: 30, opacity: 0, stagger: 0.08, duration: 0.5, delay: 0.4, ease: 'back.out(1.7)' });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.jobTitle || !form.city || !form.writeUp) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await submitWorkerProfile({
        ...form,
        yearsOfExperience: Number(form.yearsOfExperience) || 0,
      });
      setResult(res.data);

      // Also fetch ML score from the scoring service
      try {
        const mlRes = await getMLScore({
          title: form.jobTitle,
          city: form.city,
          xp_years: Number(form.yearsOfExperience) || 0,
          write_up: form.writeUp,
        });
        setMlScore(mlRes.data);
      } catch {
        // ML scoring is optional — don't block on failure
        setMlScore(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    }
    setLoading(false);
  };

  return (
    <div className="worker-page" ref={pageRef}>
      {/* 3D Background */}
      <motion.div className="worker-page__canvas" style={{ y: bgY }}>
        <Canvas camera={{ position: [0, 0, 7], fov: 45 }} dpr={[1, 1.5]}>
          <fog attach="fog" args={['#0a0a0f', 5, 16]} />
          <BgParticles mouse={mouse} />
          <FloatingShape position={[-4, 2, -3]} color="#ff3d5a" scale={0.2} />
          <FloatingShape position={[4, -1, -2]} color="#a855f7" scale={0.25} />
          <FloatingShape position={[-3, -2, -4]} color="#06b6d4" scale={0.18} />
          <Stars radius={40} depth={60} count={500} factor={3} fade speed={0.3} />
        </Canvas>
      </motion.div>

      <div className="worker-page__inner section-container">
        <motion.div
          className="worker-hero"
          initial={{ opacity: 0, y: 40, filter: 'blur(15px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1>Your AI Vulnerability<br /><span className="gradient-text">Risk Score</span></h1>
          <p>Layer 2 — Granular assessment based on your specific job function, skill rarity, and AI proximity.</p>
        </motion.div>

        <div className="worker-layout">
          {/* Form */}
          <TiltCard className="worker-form glass">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Job Title / Role *</label>
                <input
                  name="jobTitle"
                  value={form.jobTitle}
                  onChange={handleChange}
                  placeholder="e.g. Data Entry Operator, BPO Agent"
                />
              </div>

              <div className="form-group">
                <label>City *</label>
                <select name="city" value={form.city} onChange={handleChange}>
                  <option value="">Select city</option>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Experience (years)</label>
                <input
                  name="yearsOfExperience"
                  type="number"
                  min="0"
                  max="50"
                  value={form.yearsOfExperience}
                  onChange={handleChange}
                  placeholder="e.g. 5"
                />
              </div>

              <div className="form-group">
                <label>Describe Your Work *</label>
                <textarea
                  name="writeUp"
                  value={form.writeUp}
                  onChange={handleChange}
                  rows={5}
                  placeholder="Tell us what you do day-to-day, tools you use, skills you have, and what you'd like to learn..."
                />
              </div>

              {error && <p className="form-error">{error}</p>}

              <motion.button
                type="submit"
                className="btn btn--primary btn--lg btn--glow"
                disabled={loading}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
              >
                {loading ? 'Analyzing…' : 'Analyze My Risk →'}
              </motion.button>
            </form>
          </TiltCard>

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div
                className="worker-result"
                initial={{ opacity: 0, x: 40, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <RiskGauge score={result.riskScore} />

                {/* ML Model Score */}
                {mlScore && (
                  <motion.div
                    className="result-card glass"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.5 }}
                  >
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      ML Model Score
                      <span className="vuln-badge" style={{ background: '#22c55e22', color: '#22c55e', fontSize: '0.7em' }}>
                        {mlScore.scoring_mode === 'model' ? 'LightGBM' : 'Fallback'}
                      </span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                      <span style={{ fontSize: '2rem', fontWeight: 700, color: mlScore.final_risk_score >= 75 ? 'var(--red)' : mlScore.final_risk_score >= 50 ? 'var(--orange)' : mlScore.final_risk_score >= 25 ? 'var(--yellow)' : 'var(--green)' }}>
                        {mlScore.final_risk_score}
                      </span>
                      <span className="vuln-badge" style={{ background: (mlScore.final_risk_score >= 75 ? 'var(--red)' : mlScore.final_risk_score >= 50 ? 'var(--orange)' : mlScore.final_risk_score >= 25 ? 'var(--yellow)' : 'var(--green)') + '22', color: mlScore.final_risk_score >= 75 ? 'var(--red)' : mlScore.final_risk_score >= 50 ? 'var(--orange)' : mlScore.final_risk_score >= 25 ? 'var(--yellow)' : 'var(--green)' }}>
                        {mlScore.category}
                      </span>
                    </div>
                    {mlScore.top_features && mlScore.top_features.length > 0 && (
                      <div>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: 8, opacity: 0.7 }}>SHAP Feature Contributions</h4>
                        {mlScore.top_features.map((f, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ opacity: 0.8 }}>{f.feature}</span>
                            <span style={{ color: f.shap_value > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                              {f.shap_value > 0 ? '+' : ''}{f.shap_value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {mlScore.confidence_std != null && (
                      <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: 8 }}>
                        Confidence ±{mlScore.confidence_std}
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Extracted Skills */}
                {result.extractedSkills && (
                  <motion.div
                    className="result-card glass"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                  >
                    <h3>Detected Skills</h3>
                    <SkillTags label="Technical" items={result.extractedSkills.explicit} color="var(--blue)" />
                    <SkillTags label="Implicit" items={result.extractedSkills.implicit} color="var(--purple)" />
                    <SkillTags label="Soft Skills" items={result.extractedSkills.soft} color="var(--cyan)" />
                    <SkillTags label="AI Readiness" items={result.extractedSkills.aiReadiness} color="var(--green)" />
                    {result.extractedSkills.aspirations?.length > 0 && (
                      <SkillTags label="Aspirations" items={result.extractedSkills.aspirations} color="var(--yellow)" />
                    )}
                  </motion.div>
                )}

                {/* Risk Signals */}
                {result.signals && result.signals.length > 0 && (
                  <motion.div
                    className="result-card glass"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    <h3>Risk Signals</h3>
                    <ul className="signals-list">
                      {result.signals.map((s, i) => <motion.li key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08 }}>{s}</motion.li>)}
                    </ul>
                  </motion.div>
                )}

                {/* Reskilling Path */}
                {result.reskillingPath && (
                  <motion.div
                    className="result-card glass reskilling-card"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                  >
                    <h3>Reskilling Pathway</h3>
                    {result.reskillingPath.targetRole && (
                      <p className="reskilling-target">
                        Target Role: <strong>{result.reskillingPath.targetRole}</strong>
                      </p>
                    )}
                    {result.reskillingPath.courses?.length > 0 && (
                      <div className="course-list">
                        {result.reskillingPath.courses.map((c, i) => (
                          <motion.div
                            key={i}
                            className="course-item"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 + i * 0.1 }}
                          >
                            <span className="course-item__platform">{c.platform}</span>
                            <span className="course-item__name">{c.name}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {result.reskillingPath.estimatedWeeks && (
                      <p className="reskilling-weeks">
                        Estimated duration: <strong>{result.reskillingPath.estimatedWeeks} weeks</strong>
                      </p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* --- Gauge component --- */
function RiskGauge({ score }) {
  const color = score >= 80 ? 'var(--red)' : score >= 60 ? 'var(--orange)' : score >= 40 ? 'var(--yellow)' : 'var(--green)';
  const label = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MODERATE' : 'LOW';

  return (
    <div className="risk-gauge glass">
      <div className="gauge-ring" style={{ '--gauge-color': color, '--gauge-pct': `${score}%` }}>
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 327} 327`}
            transform="rotate(-90 60 60)"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="gauge-center">
          <span className="gauge-score">{score}</span>
          <span className="gauge-label" style={{ color }}>{label}</span>
        </div>
      </div>
      <p className="gauge-sub">AI Vulnerability Score</p>
    </div>
  );
}

/* --- Skill tags component --- */
function SkillTags({ label, items, color }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="skill-group">
      <span className="skill-group__label" style={{ color }}>{label}</span>
      <div className="skill-tags">
        {items.map((s, i) => (
          <span key={i} className="skill-tag" style={{ borderColor: color, color }}>{s}</span>
        ))}
      </div>
    </div>
  );
}
