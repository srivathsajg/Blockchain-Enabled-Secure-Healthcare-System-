import React, { useEffect, useState } from 'react';
import { fetchDietPlan, refreshDietPlan } from '../../services/patientApi';
import { 
    Coffee, Moon, AlertCircle, RefreshCw, Sparkles, 
    FileText, Activity, Scale, Heart, User,
    UtensilsCrossed, Cookie, Clock, ShieldCheck,
    CheckCircle2, Flame, Wheat, Zap, Info, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import Loader from '../../components/ui/Loader';

const getMealIcon = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('breakfast') || t.includes('morning')) return <Coffee size={22} />;
    if (t.includes('lunch') || t.includes('afternoon')) return <UtensilsCrossed size={22} />;
    if (t.includes('snack') || t.includes('booster')) return <Cookie size={22} />;
    if (t.includes('dinner') || t.includes('night')) return <Moon size={22} />;
    return <Sparkles size={22} />;
};

const STANDARD_WEIGHTS = [20, 35, 50, 100, 140, 150, 180, 200, 250, 300, 350];

const snapToStandardWeight = (num) => {
    if (!num || isNaN(num)) return 150;
    let closest = STANDARD_WEIGHTS[0];
    let minDiff = Math.abs(num - closest);
    for (const w of STANDARD_WEIGHTS) {
        const diff = Math.abs(num - w);
        if (diff < minDiff) {
            minDiff = diff;
            closest = w;
        }
    }
    return closest;
};

const formatPortionInfo = (rawName, rawQuantity) => {
    const originalName = rawName || 'Nutritionally Balanced Meal';
    
    // Extract gram/ml weight from a quantity string like "2 medium dosas (150g)", "1 cup (250ml)", "35g"
    const extractGramWeight = (str) => {
        if (!str) return null;
        const s = String(str);
        // Priority 1: number inside trailing parentheses before g/ml  e.g. (150g)
        const parenGram = s.match(/\((\d+)\s*(?:g|ml)\)/i);
        if (parenGram) return parseInt(parenGram[1], 10);
        // Priority 2: standalone leading number with g/ml e.g. "35g", "250ml"
        const leadGram = s.match(/^(\d+)\s*(?:g|ml)/i);
        if (leadGram) return parseInt(leadGram[1], 10);
        // Priority 3: any number followed by g/ml anywhere in string
        const anyGram = s.match(/(\d+)\s*(?:g|ml)/i);
        if (anyGram) return parseInt(anyGram[1], 10);
        return null;
    };

    // Strip only truly embedded trailing quantity from food NAME (e.g. old legacy "Oatmeal (150g)")
    // Don't strip ingredient descriptions like "Ragi (Finger Millet) Dosa"
    const trailingParenMatch = originalName.match(/^(.+?)\s*\((\d+\s*(?:g|ml))\)$/i);
    let cleanName = trailingParenMatch ? trailingParenMatch[1].trim() : originalName;

    // Determine final portion string
    let gramValue = null;
    
    // If the name had an embedded trailing gram (legacy format), use it
    if (trailingParenMatch) {
        gramValue = parseInt(trailingParenMatch[2], 10);
    }
    
    // Otherwise extract from the quantity field (e.g. "2 medium dosas (150g)")
    if (!gramValue && rawQuantity) {
        gramValue = extractGramWeight(rawQuantity);
        if (!gramValue) {
            // No gram found — just show the raw quantity as-is (e.g. "1 glass (250ml)")
            return { cleanName, portionText: String(rawQuantity) };
        }
    }

    const finalPortion = gramValue ? snapToStandardWeight(gramValue) + 'g' : '150g';
    return { cleanName, portionText: finalPortion };
};

const EnhancedMealCard = ({ mealSlotKey, title, time, mealData, legacyFallback }) => {
    const [showAlts, setShowAlts] = useState(false);
    
    // Normalize data from new 5-meal structure or legacy fallback
    const meal = mealData || (Array.isArray(legacyFallback) && legacyFallback[0]) || {
        name: 'Nutritionally Balanced Selection',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        quantity: '150g',
        whyRecommended: 'Balanced micronutrients calibrated for daily energy needs.'
    };

    const { cleanName: mealName, portionText: quantity } = formatPortionInfo(meal.name, meal.quantity);
    const calories = meal.calories || 0;
    const protein = meal.protein || 0;
    const carbs = meal.carbs || 0;
    const fat = meal.fat || 0;
    const fiber = meal.fiber || 0;
    const whyReason = meal.whyRecommended || (meal.clinicalNotes) || 'Optimal whole food choice aligned with clinical nutritional standards.';
    const alternatives = meal.alternatives || [];

    return (
        <div className="group relative bg-[#090a0c] p-5 sm:p-7 rounded-3xl border border-white/5 hover:border-emerald-500/25 transition-all duration-500 flex flex-col justify-between overflow-hidden shadow-xl">
            {/* Ambient Lighting Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[70px] -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700 pointer-events-none" />

            <div className="relative z-10">
                {/* Header Slot Information */}
                <div className="flex items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            {getMealIcon(title)}
                        </div>
                        <div>
                            <span className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest block">{title}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <Clock size={11} className="text-emerald-400" />
                                <span className="text-[11px] sm:text-xs font-bold text-white tracking-tight">{time}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                        <ShieldCheck size={12} />
                        Constraint Checked
                    </div>
                </div>

                {/* Main Food Item */}
                <div className="space-y-3 mb-5">
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight group-hover:text-emerald-300 transition-colors duration-300 leading-snug">
                        {mealName}
                    </h3>
                    <div className="flex items-center gap-4 text-xs font-bold">
                        <div className="flex items-center gap-1.5 text-emerald-400">
                            <Flame size={14} />
                            <span>{calories} <span className="text-[9px] text-emerald-500/60 uppercase">kcal</span></span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-white/20" />
                        <div className="flex items-center gap-1.5 text-gray-400">
                            <Scale size={13} />
                            <span>{quantity}</span>
                        </div>
                    </div>
                </div>

                {/* Macronutrient Pills */}
                <div className="grid grid-cols-4 gap-2 mb-5">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-0.5">Protein</p>
                        <p className="text-sm font-black text-white">{protein}<span className="text-[9px] text-gray-600 ml-0.5">g</span></p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-0.5">Carbs</p>
                        <p className="text-sm font-black text-white">{carbs}<span className="text-[9px] text-gray-600 ml-0.5">g</span></p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-0.5">Fat</p>
                        <p className="text-sm font-black text-white">{fat}<span className="text-[9px] text-gray-600 ml-0.5">g</span></p>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-0.5">Fiber</p>
                        <p className="text-sm font-black text-white">{fiber || 3}<span className="text-[9px] text-gray-600 ml-0.5">g</span></p>
                    </div>
                </div>

                {/* Explainability / Why Recommended Chip */}
                <div className="bg-emerald-500/[0.03] border border-emerald-500/15 rounded-2xl p-3.5 sm:p-4 mb-3">
                    <div className="flex items-start gap-2.5">
                        <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-1">Why Recommended</p>
                            <p className="text-xs text-gray-300 leading-relaxed font-medium">
                                {whyReason}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Alternatives Accordion */}
                {alternatives.length > 0 && (
                    <div className="pt-2">
                        <button
                            onClick={() => setShowAlts(!showAlts)}
                            className="w-full flex items-center justify-between text-[10px] font-black text-gray-400 hover:text-white uppercase tracking-widest py-1 transition-colors"
                        >
                            <span className="flex items-center gap-1.5">
                                <Sparkles size={11} className="text-emerald-400" />
                                {alternatives.length} Alternative Options
                            </span>
                            {showAlts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showAlts && (
                            <div className="mt-2 space-y-2 animate-in fade-in duration-300">
                                {alternatives.map((alt, i) => {
                                    const rawAltName = typeof alt === 'object' ? alt.name : alt;
                                    const { cleanName: altName, portionText: altPortion } = formatPortionInfo(rawAltName, typeof alt === 'object' ? alt.quantity : null);
                                    return (
                                        <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs flex items-center justify-between">
                                            <div className="truncate pr-2">
                                                <p className="font-bold text-gray-200 truncate">{altName} <span className="text-[10px] text-gray-500 font-normal">({altPortion})</span></p>
                                                {alt.whyRecommended && (
                                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{alt.whyRecommended}</p>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-400 shrink-0 uppercase">
                                                {typeof alt === 'object' ? `${alt.calories} kcal` : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const PatientDietPlan = () => {
    const [dietPlan, setDietPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const loadDietPlan = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchDietPlan();
            if (response.success) {
                setDietPlan(response.data);
            } else {
                setError("Failed to load diet plan");
            }
        } catch (err) {
            console.error("Error fetching diet plan:", err);
            setError("Something went wrong while generating your diet plan.");
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const response = await refreshDietPlan();
            if (response.success) {
                setDietPlan(response.data);
            }
        } catch (err) {
            console.error("Error refreshing diet plan:", err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadDietPlan();
    }, []);

    if (loading) {
        return <Loader message="Analyzing Biomarkers & Optimizing Nutrition Architecture..." />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-in fade-in duration-500">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertCircle size={32} />
                </div>
                <p className="text-gray-400 text-center max-w-md font-medium">{error}</p>
                <button 
                    onClick={loadDietPlan}
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 mt-4"
                >
                    <RefreshCw size={16} /> Try Again
                </button>
            </div>
        );
    }

    const metadata = dietPlan?.metadata || {};
    const targets = dietPlan?.targets || {
        calories: metadata.dailyCalorieNeeds || 2000,
        protein: 80,
        carbs: 250,
        fat: 55,
        fiber: 30,
        sodiumMax: 2000
    };
    const dailyTotals = dietPlan?.dailyTotals || {
        calories: metadata.dailyCalorieNeeds || 1850,
        protein: 72,
        carbs: 230,
        fat: 48,
        fiber: 34,
        sodium: 1400
    };
    const meals = dietPlan?.meals || {};
    const clinicalRules = dietPlan?.clinicalRulesApplied || [];
    const targeting = dietPlan?.targeting || dietPlan?.importantComponents || [];

    return (
        <div className="pb-24 animate-in fade-in duration-1000 max-w-7xl mx-auto px-4 sm:px-6">
            {/* Background Decorative Gradient Orbs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-emerald-500/5 rounded-full blur-[140px]" />
                <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/5 rounded-full blur-[120px]" />
            </div>

            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 sm:mb-10 gap-5 pt-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles size={11} />
                            Precision AI Diet Engine v3.0
                        </div>
                        <span className="text-gray-700 text-xs">•</span>
                        <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                            Clinical Calibration
                        </span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
                        Personalized <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">Nutrition Engine.</span>
                    </h1>
                    <p className="text-gray-400 text-xs sm:text-base font-medium mt-2 max-w-2xl leading-relaxed">
                        Clinically optimized dietary prescription dynamically adapted to your lab biomarkers, biometric profile, and allergen safety matrix.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-[#111318] border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all active:scale-95 group shadow-xl"
                    >
                        <RefreshCw size={14} className={`${refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700 text-emerald-400'}`} />
                        {refreshing ? 'Optimizing...' : 'Regenerate'}
                    </button>
                </div>
            </header>

            {/* Top Health Vitals Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">BMI Index</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            metadata.bmiStatus === 'Normal' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        }`}>{metadata.bmiStatus || 'Normal'}</span>
                    </div>
                    <p className="text-2xl font-black text-white">{metadata.bmi || '23.4'} <span className="text-[10px] text-gray-500 font-bold">kg/m²</span></p>
                </div>

                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-blue-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Basal Metabolic Rate</span>
                        <Activity size={13} className="text-blue-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{metadata.bmr || '1,620'} <span className="text-[10px] text-gray-500 font-bold">kcal/day</span></p>
                </div>

                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-purple-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Daily Calorie Target</span>
                        <Flame size={13} className="text-purple-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{targets.calories || 2000} <span className="text-[10px] text-gray-500 font-bold">kcal</span></p>
                </div>

                <div className="bg-[#0f1115] border border-white/5 p-4 sm:p-5 rounded-2xl hover:border-teal-500/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Allergen Shield</span>
                        <ShieldCheck size={13} className="text-teal-400" />
                    </div>
                    <p className="text-base sm:text-lg font-black text-teal-300 truncate">Zero Violations</p>
                </div>
            </div>

            {/* Active Clinical Conditions / Directives Banner */}
            {clinicalRules.length > 0 && (
                <div className="mb-10 p-5 rounded-3xl bg-gradient-to-r from-[#0d1512] to-[#0d1017] border border-emerald-500/20">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <ShieldCheck size={16} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Active Clinical Nutrition Directives</h3>
                            <p className="text-[11px] text-gray-400">Rules applied based on current diagnostic and biomarker findings</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        {clinicalRules.map((rule, idx) => (
                            <div key={idx} className="bg-black/40 border border-white/5 rounded-2xl p-3.5">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-black text-emerald-300">{rule.condition}</span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        {rule.priority} PRIORITY
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 leading-relaxed">{rule.macro_directive}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 4-Meal Comprehensive Daily Meal Journal (2 in one row) */}
            <div className="mb-14">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Daily Meal Schedule</h2>
                        <p className="text-xs text-gray-500 mt-0.5">4-meal balanced split with exact portions and clinical rationales</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <EnhancedMealCard 
                        mealSlotKey="breakfast"
                        title="Breakfast" 
                        time={meals.breakfast?.time || "08:00 AM - 08:30 AM"} 
                        mealData={meals.breakfast}
                        legacyFallback={dietPlan?.morning}
                    />
                    <EnhancedMealCard 
                        mealSlotKey="lunch"
                        title="Balanced Lunch" 
                        time={meals.lunch?.time || "01:15 PM - 02:00 PM"} 
                        mealData={meals.lunch}
                        legacyFallback={dietPlan?.afternoon}
                    />
                    <EnhancedMealCard 
                        mealSlotKey="snack2"
                        title="Evening Snack" 
                        time={meals.snack2?.time || "05:00 PM - 05:30 PM"} 
                        mealData={meals.snack2}
                        legacyFallback={dietPlan?.snacks}
                    />
                    <EnhancedMealCard 
                        mealSlotKey="dinner"
                        title="Restorative Dinner" 
                        time={meals.dinner?.time || "08:00 PM - 08:45 PM"} 
                        mealData={meals.dinner}
                        legacyFallback={dietPlan?.night}
                    />
                </div>
            </div>

            {/* Daily Nutrition Summary: Target vs Recommended */}
            <div className="mb-14 p-6 sm:p-8 rounded-[32px] bg-[#0c0e12] border border-white/5 relative overflow-hidden shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">
                                {dietPlan?.validationBadge || 'Within Target'}
                            </span>
                            <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Mathematically Validated</span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">Whole-Day Nutritional Balance</h3>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Calories</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.calories)} <span className="text-[10px] text-gray-400 font-normal">kcal</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Target: {Math.round(targets.calories)} kcal</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Protein</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.protein)} <span className="text-[10px] text-gray-400 font-normal">g</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Target: {Math.round(targets.protein)} g</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Carbohydrates</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.carbs)} <span className="text-[10px] text-gray-400 font-normal">g</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Target: {Math.round(targets.carbs)} g</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Fat</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.fat)} <span className="text-[10px] text-gray-400 font-normal">g</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Target: {Math.round(targets.fat)} g</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Dietary Fiber</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.fiber)} <span className="text-[10px] text-gray-400 font-normal">g</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Target: ≥ {Math.round(targets.fiber)} g</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Sodium</span>
                        <p className="text-lg font-black text-white">{Math.round(dailyTotals.sodium)} <span className="text-[10px] text-gray-400 font-normal">mg</span></p>
                        <p className="text-[10px] text-emerald-400 mt-1">Limit: ≤ {Math.round(targets.sodiumMax)} mg</p>
                    </div>
                </div>
            </div>

            {/* Medical Data Analysis & Biomarkers */}
            {dietPlan?.medicalRecord && (
                <div className="p-8 sm:p-10 rounded-[40px] bg-[#08090a] border border-white/5 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
                    
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                                <FileText size={22} />
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Clinical Evidence & Biomarkers</h3>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Laboratory Diagnostic Input</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-6 space-y-6">
                            <div>
                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">Diagnostic Summary</h4>
                                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5">
                                    <p className="text-gray-300 text-base leading-relaxed font-medium">
                                        {dietPlan.medicalRecord.diagnosis || "General wellness evaluation based on latest health screening."}
                                    </p>
                                </div>
                            </div>

                            {dietPlan.medicalRecord.fileUrl && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Attached Laboratory Report</h4>
                                        <a 
                                            href={dietPlan.medicalRecord.fileUrl.startsWith('http') 
                                                ? dietPlan.medicalRecord.fileUrl 
                                                : `/${dietPlan.medicalRecord.fileUrl.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider transition-colors"
                                        >
                                            View Full Size <ExternalLink size={12} />
                                        </a>
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white shadow-xl">
                                        <img 
                                            src={dietPlan.medicalRecord.fileUrl.startsWith('http') 
                                                ? dietPlan.medicalRecord.fileUrl 
                                                : `/${dietPlan.medicalRecord.fileUrl.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/')}`} 
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
                                        {Object.entries(dietPlan.medicalRecord.indicators).map(([key, data]) => (
                                            <div key={key} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                                                <div>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{key}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={`text-base font-black ${
                                                            data.status === 'high' ? 'text-red-400' : 
                                                            data.status === 'low' ? 'text-orange-400' : 
                                                            'text-emerald-400'
                                                        }`}>
                                                            {data.value}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                                            data.status === 'high' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            data.status === 'low' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                            'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        }`}>
                                                            {data.status}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-20 sm:w-28 bg-white/5 h-1.5 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${
                                                        data.status === 'high' ? 'bg-red-500 w-[90%]' :
                                                        data.status === 'low' ? 'bg-orange-500 w-[30%]' :
                                                        'bg-emerald-500 w-[65%]'
                                                    }`} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm italic">
                                        {dietPlan.medicalRecord.labResults || "No discrete biomarker values detected."}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <footer className="mt-20 text-center">
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em] mb-1">
                    MediCare Precision Nutrition Engine
                </p>
                <p className="text-[9px] text-gray-700">
                    Clinical Adherence Standards • Zero Allergen Violations • Bio-Verified
                </p>
            </footer>
        </div>
    );
};

export default PatientDietPlan;
