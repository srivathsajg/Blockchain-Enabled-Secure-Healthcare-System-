import React, { useEffect, useState } from 'react';
import { fetchDietPlan, refreshDietPlan } from '../../services/patientApi';
import { 
    Coffee, Moon, AlertCircle, RefreshCw, Sparkles, 
    FileText, Activity, Scale, Heart, User,
    UtensilsCrossed, Cookie, Clock, ShieldCheck,
    CheckCircle2, Flame, Wheat, Zap, Info, ChevronDown, ChevronUp, ExternalLink, Apple
} from 'lucide-react';
import Loader from '../../components/ui/Loader';

// ── Helpers ──────────────────────────────────────────────────────────────────

const getMealIcon = (slotKey) => {
    if (!slotKey) return <Sparkles size={22} />;
    const s = slotKey.toLowerCase();
    if (s.includes('breakfast'))      return <Coffee size={22} />;
    if (s.includes('morning'))        return <Apple size={22} />;
    if (s.includes('lunch'))          return <UtensilsCrossed size={22} />;
    if (s.includes('evening'))        return <Cookie size={22} />;
    if (s.includes('dinner') || s.includes('night')) return <Moon size={22} />;
    return <Sparkles size={22} />;
};

// Safe number display — never returns NaN
const safeNum = (v, fallback = 0) =>
    typeof v === 'number' && !isNaN(v) ? v : (parseFloat(v) || fallback);

// ── Meal Card ─────────────────────────────────────────────────────────────────
const EnhancedMealCard = ({ slotKey, title, time, mealData }) => {
    const [expanded, setExpanded] = useState(false);

    if (!mealData) {
        return (
            <div className="bg-[#090a0c] p-5 rounded-3xl border border-white/5 flex items-center justify-center min-h-[180px]">
                <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">No data for this meal</p>
            </div>
        );
    }

    const calories = safeNum(mealData.calories);
    const protein  = safeNum(mealData.protein ?? mealData.protein_g);
    const carbs    = safeNum(mealData.carbs   ?? mealData.carbs_g);
    const fat      = safeNum(mealData.fat     ?? mealData.fat_g);
    const fiber    = safeNum(mealData.fiber   ?? mealData.fiber_g);
    const foods    = mealData.foods || [];

    const primaryName = mealData.name || foods[0]?.food_name || 'Meal';
    const reason      = mealData.whyRecommended || foods[0]?.reason || '';

    return (
        <div className="group relative bg-[#090a0c] p-5 sm:p-7 rounded-3xl border border-white/5 hover:border-emerald-500/25 transition-all duration-500 flex flex-col overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[70px] -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700 pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            {getMealIcon(slotKey)}
                        </div>
                        <div>
                            <span className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest block">{title}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <Clock size={11} className="text-emerald-400" />
                                <span className="text-[11px] sm:text-xs font-bold text-white tracking-tight">{time || mealData.time || '—'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                        {time || mealData.time || 'Scheduled'}
                    </div>
                </div>

                {/* Primary food name + calories */}
                <div className="space-y-2 mb-5">
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight group-hover:text-emerald-300 transition-colors duration-300 leading-snug">
                        {primaryName}
                    </h3>
                    {foods.length > 1 && (
                        <p className="text-[10px] text-gray-500 font-medium">
                            + {foods.slice(1).map(f => f.food_name).join(', ')}
                        </p>
                    )}
                    <div className="flex items-center gap-4 text-xs font-bold">
                        <div className="flex items-center gap-1.5 text-emerald-400">
                            <Flame size={14} />
                            <span>{calories} <span className="text-[9px] text-emerald-500/60 uppercase">kcal</span></span>
                        </div>
                        {mealData.quantity && (
                            <>
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                                <div className="flex items-center gap-1.5 text-gray-400">
                                    <Scale size={13} />
                                    <span className="text-[10px]">{mealData.quantity}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Macro pills */}
                <div className="grid grid-cols-4 gap-2 mb-5">
                    {[
                        { label: 'Protein', value: protein },
                        { label: 'Carbs',   value: carbs   },
                        { label: 'Fat',     value: fat     },
                        { label: 'Fiber',   value: fiber   },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
                            <p className="text-sm font-black text-white">{safeNum(value).toFixed(1)}<span className="text-[9px] text-gray-600 ml-0.5">g</span></p>
                        </div>
                    ))}
                </div>

                {/* Why recommended */}
                {reason && (
                    <div className="bg-emerald-500/[0.03] border border-emerald-500/15 rounded-2xl p-3.5 mb-3">
                        <div className="flex items-start gap-2.5">
                            <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-1">Why Recommended</p>
                                <p className="text-xs text-gray-300 leading-relaxed font-medium">{reason}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* All foods accordion */}
                {foods.length > 1 && (
                    <div className="pt-2">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="w-full flex items-center justify-between text-[10px] font-black text-gray-400 hover:text-white uppercase tracking-widest py-1 transition-colors"
                        >
                            <span className="flex items-center gap-1.5">
                                <Sparkles size={11} className="text-emerald-400" />
                                {foods.length} Foods in this meal
                            </span>
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expanded && (
                            <div className="mt-2 space-y-2">
                                {foods.map((food, i) => (
                                    <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs flex items-center justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-200 truncate">{food.food_name}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{food.quantity_description || `${food.quantity_g || '—'}g`}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className="text-[10px] font-black text-emerald-400">
                                                {safeNum(food.calories_kcal || food.calories)} kcal
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Page Component ───────────────────────────────────────────────────────
const PatientDietPlan = () => {
    const [dietPlan, setDietPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [justRegenerated, setJustRegenerated] = useState(false);
    const [regenerationCount, setRegenerationCount] = useState(0);

    const loadDietPlan = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchDietPlan();
            if (response.success) {
                setDietPlan(response.data);
            } else {
                setError('Failed to load diet plan');
            }
        } catch (err) {
            console.error('Error fetching diet plan:', err);
            setError('Something went wrong while generating your diet plan.');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setDietPlan(null);
        setRefreshing(true);
        setJustRegenerated(false);
        setError(null);
        try {
            const response = await refreshDietPlan();
            if (response.success) {
                setDietPlan(response.data);
                setRegenerationCount(c => c + 1);
                setJustRegenerated(true);
                setTimeout(() => setJustRegenerated(false), 5000);
            } else {
                setError('Regeneration failed. Please try again.');
            }
        } catch (err) {
            console.error('Error refreshing diet plan:', err);
            setError('Something went wrong while regenerating your diet plan.');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => { loadDietPlan(); }, []);

    if (loading || refreshing) {
        return <Loader message={refreshing ? 'Regenerating Personalized Diet Plan from Medical Profile...' : 'Analyzing Biomarkers & Formulating Nutrition Plan...'} />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-in fade-in duration-500">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertCircle size={32} />
                </div>
                <p className="text-gray-400 text-center max-w-md font-medium">{error}</p>
                <button onClick={loadDietPlan} className="flex items-center gap-2 px-8 py-3 bg-emerald-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 mt-4">
                    <RefreshCw size={16} /> Try Again
                </button>
            </div>
        );
    }

    // ── Data extraction with NaN-safe normalizer ──────────────────────────────
    const metadata  = dietPlan?.metadata || {};
    const targets   = dietPlan?.targets  || { calories: metadata.dailyCalorieNeeds || 2000, protein: 80, carbs: 250, fat: 55, fiber: 30, sodiumMax: 2000 };
    const meals     = dietPlan?.meals    || {};
    const clinicalRules = dietPlan?.clinicalRulesApplied || [];

    const rawTotals  = dietPlan?.dailyTotals || {};
    const dailyTotals = {
        calories:   safeNum(rawTotals.calories),
        protein:    safeNum(rawTotals.protein   ?? rawTotals.protein_g),
        carbs:      safeNum(rawTotals.carbs     ?? rawTotals.carbs_g),
        fat:        safeNum(rawTotals.fat       ?? rawTotals.fat_g),
        fiber:      safeNum(rawTotals.fiber     ?? rawTotals.fiber_g),
        sodium:     safeNum(rawTotals.sodium    ?? rawTotals.sodium_mg),
        iron_mg:    safeNum(rawTotals.iron_mg),
        calcium_mg: safeNum(rawTotals.calcium_mg),
    };

    // Meal slot definitions (4 meals)
    const MEAL_DEFINITIONS = [
        { slot: 'breakfast', title: 'Breakfast',          time: '08:00 AM' },
        { slot: 'lunch',     title: 'Balanced Lunch',     time: '01:00 PM' },
        { slot: 'snacks',    title: 'Snacks',             time: '05:00 PM' },
        { slot: 'dinner',    title: 'Restorative Dinner', time: '08:00 PM' },
    ];

    return (
        <div className="pb-24 animate-in fade-in duration-1000 max-w-7xl mx-auto px-4 sm:px-6">
            {/* Background glow */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-emerald-500/5 rounded-full blur-[140px]" />
                <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/5 rounded-full blur-[120px]" />
            </div>

            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 sm:mb-10 gap-5 pt-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles size={11} />
                            Personalized Healthcare AI
                        </div>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
                        Personalized <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">Nutrition Plan.</span>
                    </h1>
                    <p className="text-gray-400 text-xs sm:text-base font-medium mt-2 max-w-2xl leading-relaxed">
                        Formulated using your medical report, biomarker profile, and personalized dietary goals.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {justRegenerated && (
                        <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2 duration-500">
                            <CheckCircle2 size={13} />
                            New Plan Generated
                        </div>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-[#111318] border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all active:scale-95 group shadow-xl disabled:opacity-50"
                    >
                        <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700 text-emerald-400" />
                        Regenerate Diet
                    </button>
                </div>
            </header>

            {/* Vitals Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">BMI Index</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${metadata.bmiStatus === 'Normal' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>{metadata.bmiStatus || 'Normal'}</span>
                    </div>
                    <p className="text-2xl font-black text-white">{metadata.bmi || '—'} <span className="text-[10px] text-gray-500 font-bold">kg/m²</span></p>
                </div>
                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-blue-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Basal Metabolic Rate</span>
                        <Activity size={13} className="text-blue-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{metadata.bmr || '—'} <span className="text-[10px] text-gray-500 font-bold">kcal/day</span></p>
                </div>
                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-purple-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Daily Calorie Target</span>
                        <Flame size={13} className="text-purple-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{targets.calories || '—'} <span className="text-[10px] text-gray-500 font-bold">kcal</span></p>
                </div>
                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Daily Protein Goal</span>
                        <Wheat size={13} className="text-emerald-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{targets.protein || '—'} <span className="text-[10px] text-gray-500 font-bold">g/day</span></p>
                </div>
            </div>


            {/* 4-Meal Grid */}
            <div className="mb-14">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Daily Meal Schedule</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Complete 4-meal schedule calibrated to your daily targets</p>
                    </div>
                </div>

                <div key={regenerationCount} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {MEAL_DEFINITIONS.map(({ slot, title, time }) => {
                        const mealData = meals[slot] || (slot === 'snacks' ? (meals.evening_snack || meals.snack || meals.snack2) : null);
                        return (
                            <EnhancedMealCard
                                key={slot}
                                slotKey={slot}
                                title={title}
                                time={mealData?.time || time}
                                mealData={mealData}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Daily Nutrition Summary */}
            <div className="mb-14 p-6 sm:p-8 rounded-[32px] bg-[#0c0e12] border border-white/5 relative overflow-hidden shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">Daily Nutritional Summary</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Calculated totals across all 4 daily meals compared against your personalized targets.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    {[
                        { label: 'Calories',       value: dailyTotals.calories,  unit: 'kcal', target: targets.calories },
                        { label: 'Protein',        value: dailyTotals.protein,   unit: 'g',    target: targets.protein  },
                        { label: 'Carbohydrates',  value: dailyTotals.carbs,     unit: 'g',    target: targets.carbs    },
                        { label: 'Fat',            value: dailyTotals.fat,       unit: 'g',    target: targets.fat      },
                        { label: 'Dietary Fiber',  value: dailyTotals.fiber,     unit: 'g',    target: `≥${targets.fiber}` },
                        { label: 'Sodium',         value: dailyTotals.sodium,    unit: 'mg',   target: `≤${targets.sodiumMax}` },
                    ].map(({ label, value, unit, target }) => (
                        <div key={label} className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{label}</span>
                            <p className="text-lg font-black text-white">{Math.round(safeNum(value))} <span className="text-[10px] text-gray-400 font-normal">{unit}</span></p>
                            <p className="text-[10px] text-emerald-400 mt-1">Target: {typeof target === 'string' ? target : `${Math.round(safeNum(target))} ${unit}`}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Medical Record section */}
            {dietPlan?.medicalRecord && (
                <div className="p-8 sm:p-10 rounded-[40px] bg-[#08090a] border border-white/5 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Clinical Evidence & Biomarkers</h3>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Laboratory Diagnostic Input</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-6 space-y-6">
                            <div>
                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">Diagnostic Summary</h4>
                                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5">
                                    <p className="text-gray-300 text-base leading-relaxed font-medium">
                                        {dietPlan.medicalRecord.diagnosis || 'General wellness evaluation based on latest health screening.'}
                                    </p>
                                </div>
                            </div>
                            {dietPlan.medicalRecord.fileUrl && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Attached Laboratory Report</h4>
                                        <a
                                            href={dietPlan.medicalRecord.fileUrl.startsWith('http') ? dietPlan.medicalRecord.fileUrl : `/${dietPlan.medicalRecord.fileUrl.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/')}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider transition-colors"
                                        >
                                            View Full Size <ExternalLink size={12} />
                                        </a>
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white shadow-xl">
                                        <img
                                            src={dietPlan.medicalRecord.fileUrl.startsWith('http') ? dietPlan.medicalRecord.fileUrl : `/${dietPlan.medicalRecord.fileUrl.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/')}`}
                                            alt="Full Laboratory Report"
                                            className="w-full h-auto object-contain block"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="lg:col-span-6 space-y-4">
                            <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3">Biomarker Indicator Panel</h4>
                            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-6 space-y-4">
                                {dietPlan.medicalRecord.indicators ? (
                                    <div className="grid grid-cols-1 gap-4">
                                        {Object.entries(dietPlan.medicalRecord.indicators).map(([key, data]) => {
                                            const status = String(data?.status || data?.calculatedStatus || 'UNKNOWN').toUpperCase();
                                            const value = data?.value !== undefined && data?.value !== null ? data.value : '—';
                                            const unit = data?.unit || '';
                                            const refLow = data?.referenceLow ?? data?.referenceMin;
                                            const refHigh = data?.referenceHigh ?? data?.referenceMax;
                                            const refText = data?.referenceText || (refLow != null && refHigh != null ? `${refLow} – ${refHigh} ${unit}` : '');

                                            const statusBadgeClass =
                                                status === 'HIGH'    ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                status === 'LOW'     ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                status === 'NORMAL'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                       'bg-gray-500/10 text-gray-400 border-gray-500/20';

                                            const valueTextClass =
                                                status === 'HIGH'    ? 'text-red-400' :
                                                status === 'LOW'     ? 'text-orange-400' :
                                                status === 'NORMAL'  ? 'text-emerald-400' :
                                                                       'text-gray-200';

                                            const barColorClass =
                                                status === 'HIGH'    ? 'bg-red-500 w-[90%]' :
                                                status === 'LOW'     ? 'bg-orange-500 w-[25%]' :
                                                status === 'NORMAL'  ? 'bg-emerald-500 w-[60%]' :
                                                                       'bg-gray-600 w-[45%]';

                                            return (
                                                <div key={key} className="flex items-center justify-between border-b border-white/5 pb-3.5 last:border-0 last:pb-0 gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider truncate">{key}</span>
                                                            {refText && (
                                                                <span className="text-[9px] text-gray-500 font-medium shrink-0">Ref: {refText}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-base font-black ${valueTextClass}`}>
                                                                {value} <span className="text-[10px] text-gray-400 font-normal">{unit}</span>
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${statusBadgeClass}`}>
                                                                {status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-16 sm:w-24 bg-white/5 h-1.5 rounded-full overflow-hidden shrink-0">
                                                        <div className={`h-full rounded-full ${barColorClass}`} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm italic">{dietPlan.medicalRecord.labResults || 'No discrete biomarker values detected.'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <footer className="mt-20 text-center">
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em] mb-1">
                    Medicare Personalized Healthcare & Nutrition
                </p>
                <p className="text-[9px] text-gray-700">
                    Clinical-grade personalized nutrition decision support
                </p>
            </footer>
        </div>
    );
};

export default PatientDietPlan;
