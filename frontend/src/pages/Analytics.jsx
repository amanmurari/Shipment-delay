import { useState, useEffect } from 'react';
import { fetchAnalytics } from '../api';
import {
    BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
    Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Target, Brain, TrendingUp, Truck } from 'lucide-react';


const COLORS = ['#FF4444', '#FFA500', '#00CC66'];

export default function Analytics() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;
    if (!data) return <div className="loading-spinner">Failed to load analytics</div>;

    const { model_metrics, carrier_heatmap, roi, risk_distribution, risk_trend } = data;

    const pieData = risk_distribution.labels.map((label, i) => ({
        name: label,
        value: risk_distribution.values[i],
        color: risk_distribution.colors[i],
    }));

    const modelPerfData = [
        { metric: 'Precision', value: model_metrics.precision * 100 },
        { metric: 'Recall', value: model_metrics.recall * 100 },
        { metric: 'F1 Score', value: model_metrics.f1_score * 100 },
        { metric: 'ROC-AUC', value: model_metrics.roc_auc * 100 },
    ];

    const radarData = [
        { feature: 'Precision', A: model_metrics.precision * 100, fullMark: 100 },
        { feature: 'Recall', A: model_metrics.recall * 100, fullMark: 100 },
        { feature: 'F1 Score', A: model_metrics.f1_score * 100, fullMark: 100 },
        { feature: 'ROC-AUC', A: model_metrics.roc_auc * 100, fullMark: 100 },
        { feature: 'Specificity', A: (1 - model_metrics.false_positive_rate) * 100, fullMark: 100 },
    ];

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Analytics & ROI Dashboard</h2>
                <p>Model performance, carrier analysis, and return on investment</p>
            </div>

            {/* ROI Stat Cards */}
            <div className="stat-grid">
                <div className="stat-card accent">
                    <div className="label">Total Predictions</div>
                    <div className="value">{model_metrics.total_predictions}</div>
                    <div className="sub">Shipments analyzed</div>
                </div>
                <div className="stat-card risk-low">
                    <div className="label">SLAs Saved</div>
                    <div className="value">{roi.sla_saved}</div>
                    <div className="sub">Through interventions</div>
                </div>
                <div className="stat-card accent">
                    <div className="label">ROC-AUC Score</div>
                    <div className="value" style={{ color: 'var(--accent-purple)' }}>{model_metrics.roc_auc}</div>
                    <div className="sub">Model accuracy metric</div>
                </div>
                <div className="stat-card risk-low">
                    <div className="label">Cost Saved</div>
                    <div className="value" style={{ fontSize: '24px' }}>₹{roi.cost_saved_inr.toLocaleString()}</div>
                    <div className="sub">Penalties avoided</div>
                </div>
                <div className="stat-card">
                    <div className="label">Avg Prediction Window</div>
                    <div className="value" style={{ fontSize: '24px', color: 'var(--accent-cyan)' }}>{model_metrics.avg_prediction_window_hrs} hrs</div>
                    <div className="sub">Before SLA deadline</div>
                </div>
                <div className="stat-card">
                    <div className="label">False Positive Rate</div>
                    <div className="value" style={{ fontSize: '24px', color: 'var(--risk-medium)' }}>{(model_metrics.false_positive_rate * 100).toFixed(0)}%</div>
                    <div className="sub">Alert accuracy</div>
                </div>
            </div>

            <div className="grid-2">
                {/* Risk Distribution Pie */}
                <div className="glass-card">
                    <div className="card-header">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Target size={18} className="icon" /> Risk Distribution
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={4}
                                dataKey="value"
                            >
                                {pieData.map((entry, i) => (
                                    <Cell key={i} fill={entry.color} stroke="transparent" />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#94A3B8' }}
                            />
                            <Legend
                                formatter={(value) => <span style={{ color: '#94A3B8', fontSize: 12 }}>{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Model Performance Radar */}
                <div className="glass-card">
                    <div className="card-header">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Brain size={18} className="icon" /> Model Performance
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <RadarChart data={radarData}>
                            <PolarGrid stroke="#333" />
                            <PolarAngleAxis dataKey="feature" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                            <PolarRadiusAxis tick={{ fill: '#64748B', fontSize: 10 }} domain={[0, 100]} />
                            <Radar name="Model" dataKey="A" stroke="#3B82F6" fill="#3B82F660" strokeWidth={2} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid-2">
                {/* Risk Trend Line Chart */}
                <div className="glass-card">
                    <div className="card-header">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={18} className="icon" /> 7-Day Risk Trend
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={risk_trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                            <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="high" stroke="#FF4444" strokeWidth={2} dot={false} name="High Risk" />
                            <Line type="monotone" dataKey="medium" stroke="#FFA500" strokeWidth={2} dot={false} name="Medium" />
                            <Line type="monotone" dataKey="low" stroke="#00CC66" strokeWidth={2} dot={false} name="On Track" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Model Metrics Bar Chart */}
                <div className="glass-card">
                    <div className="card-header">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Brain size={18} className="icon" /> Model Metrics
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <RechartsBarChart data={modelPerfData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                            <YAxis type="category" dataKey="metric" width={80} tick={{ fill: '#94A3B8', fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                                formatter={(val) => [`${val.toFixed(1)}%`]}
                            />
                            <Bar dataKey="value" fill="#3B82F6" radius={[0, 6, 6, 0]} barSize={24} />
                        </RechartsBarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Carrier Heatmap Table */}
            <div className="glass-card">
                <div className="card-header">
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Truck size={18} className="icon" /> Carrier Performance Heatmap
                    </div>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Carrier</th>
                            <th>Total Shipments</th>
                            <th>High Risk</th>
                            <th>Risk Rate</th>
                            <th>Avg Reliability</th>
                            <th>Performance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {carrier_heatmap.map((c, i) => {
                            const perfColor = c.avg_reliability >= 80 ? '#00CC66' : c.avg_reliability >= 70 ? '#FFA500' : '#FF4444';
                            return (
                                <tr key={i}>
                                    <td style={{ fontWeight: 600 }}>{c.carrier}</td>
                                    <td>{c.total_shipments}</td>
                                    <td>
                                        <span style={{ color: c.high_risk_count > 0 ? '#FF4444' : '#94A3B8' }}>
                                            {c.high_risk_count}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{
                                            color: c.risk_rate > 30 ? '#FF4444' : c.risk_rate > 15 ? '#FFA500' : '#00CC66',
                                            fontWeight: 600,
                                        }}>
                                            {c.risk_rate}%
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>
                                            {c.avg_reliability}%
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ flex: 1, height: '8px', background: '#111', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${c.avg_reliability}%`,
                                                    background: perfColor,
                                                    borderRadius: '4px',
                                                    transition: 'width 0.8s ease',
                                                }} />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ROI Summary */}
            <div className="glass-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(0,204,102,0.05) 0%, rgba(59,130,246,0.05) 100%)' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '16px' }}>
                    Return on Investment
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '60px', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--risk-low)' }}>
                            ₹{roi.cost_saved_inr.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Saved Today</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--accent-blue)' }}>
                            1:{roi.roi_ratio}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>ROI Ratio</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--accent-purple)' }}>
                            ₹{(roi.projected_monthly_savings || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Projected Monthly</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
