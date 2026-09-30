/**
 * backend/modules/track/labStatusEngine.js
 * =========================================================================
 * SIMPLE LAB VALUE STATUS ENGINE
 *
 * Core Principle:
 * For every laboratory component extracted from the uploaded report:
 *     extracted value + reference range -> simple comparison -> LOW / HIGH / NORMAL
 *
 * Priority 1: Reference range extracted from the uploaded report using OCR.
 * Priority 2: Fallback reference range from the 50-component registry.
 * Priority 3: UNKNOWN if neither exists. NEVER assume NORMAL.
 *
 * ONE STATUS CALCULATION. ONE BIOMARKER OBJECT. NO HARD-CODED FINAL STATUS.
 */

"use strict";

const { LAB_FALLBACK_REGISTRY, findFallbackRange } = require("../../config/labReferenceRanges");

/**
 * 1. CORE STATUS LOGIC FOR TWO-SIDED RANGES
 *
 * @param {number|null} value
 * @param {number|null} low
 * @param {number|null} high
 * @returns {"LOW" | "HIGH" | "NORMAL" | "UNKNOWN"}
 */
function calculateLabStatus(value, low, high) {
  if (
    value === null ||
    value === undefined ||
    low === null ||
    low === undefined ||
    high === null ||
    high === undefined
  ) {
    return "UNKNOWN";
  }

  if (value < low) {
    return "LOW";
  }

  if (value > high) {
    return "HIGH";
  }

  return "NORMAL";
}

/**
 * 2. CORE STATUS LOGIC FOR ONE-SIDED THRESHOLD RULES
 * e.g. < 200, < 150, < 100, >= 60, > 3.1
 *
 * @param {number|null} value
 * @param {string} rule - "LESS_THAN" | "GREATER_THAN_OR_EQUAL" | "GREATER_THAN" | "LESS_THAN_OR_EQUAL"
 * @param {number|null} threshold
 * @returns {"LOW" | "HIGH" | "NORMAL" | "UNKNOWN"}
 */
function calculateThresholdStatus(value, rule, threshold) {
  if (
    value === null ||
    value === undefined ||
    threshold === null ||
    threshold === undefined
  ) {
    return "UNKNOWN";
  }

  if (rule === "LESS_THAN") {
    return value < threshold ? "NORMAL" : "HIGH";
  }

  if (rule === "GREATER_THAN_OR_EQUAL") {
    return value >= threshold ? "NORMAL" : "LOW";
  }

  if (rule === "GREATER_THAN") {
    return value > threshold ? "NORMAL" : "LOW";
  }

  if (rule === "LESS_THAN_OR_EQUAL") {
    return value <= threshold ? "NORMAL" : "HIGH";
  }

  return "UNKNOWN";
}

/**
 * Parses OCR reference string formats:
 * - "12–17.5", "12 - 17.5", "12 to 17.5", "12.0–17.5" -> { low: 12, high: 17.5 }
 * - "< 200", "<= 100", "<200" -> { rule: "LESS_THAN" | "LESS_THAN_OR_EQUAL", threshold: 200 }
 * - "> 3.5", ">= 60", ">3.1", ">=3.1" -> { rule: "GREATER_THAN" | "GREATER_THAN_OR_EQUAL", threshold: 3.5 }
 *
 * @param {string} refStr
 * @returns {Object|null}
 */
function parseOcrReferenceRange(refStr) {
  if (!refStr || typeof refStr !== "string") return null;
  const s = refStr.trim();

  // Check one-sided less-than: e.g. "< 200", "<= 100", "<200"
  const ltMatch = s.match(/^<(=)?\s*(\d+(?:\.\d+)?)/);
  if (ltMatch) {
    return {
      rule: ltMatch[1] ? "LESS_THAN_OR_EQUAL" : "LESS_THAN",
      threshold: parseFloat(ltMatch[2]),
      raw: s,
    };
  }

  // Check one-sided greater-than: e.g. "> 3.5", ">= 60", ">3.1", ">=3.1"
  const gtMatch = s.match(/^>(=)?\s*(\d+(?:\.\d+)?)/);
  if (gtMatch) {
    return {
      rule: gtMatch[1] ? "GREATER_THAN_OR_EQUAL" : "GREATER_THAN",
      threshold: parseFloat(gtMatch[2]),
      raw: s,
    };
  }

  // Check two-sided range: e.g. "12–17.5", "12 - 17.5", "12 to 17.5", "12.0-17.5"
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    if (!isNaN(low) && !isNaN(high)) {
      return {
        low,
        high,
        raw: s,
      };
    }
  }

  return null;
}

/**
 * Checks whether an OCR extracted range is usable/plausible
 */
function isRangeUsable(low, high, fallback) {
  if (isNaN(low) || isNaN(high)) return false;
  if (low >= high) return false;
  if (fallback && fallback.high !== undefined) {
    // If OCR high exceeds 4x of expected high (e.g. 1010 for 101.0, 500 for 50.0)
    // or low is heavily magnified (e.g. 400 for 40.0), OCR has digit/scale corruption
    if (high > fallback.high * 4) return false;
    if (low > fallback.high * 3) return false;
  }
  return true;
}

/**
 * Normalizes unit strings (e.g. o/dl -> g/dL, u/l -> U/L)
 */
function normalizeLabUnit(u) {
  if (!u || typeof u !== "string") return "";
  const s = u.trim().toLowerCase();
  if (s === "g/dl" || s === "o/dl" || s === "g/d" || s === "gm/dl") return "g/dL";
  if (s === "mg/dl") return "mg/dL";
  if (s === "pg/ml") return "pg/mL";
  if (s === "ng/ml") return "ng/mL";
  if (s === "µg/dl" || s === "ug/dl" || s === "mcg/dl") return "µg/dL";
  if (s === "fl" || s === "f/l") return "fL";
  if (s === "pg") return "pg";
  if (s === "%" || s === "percent") return "%";
  if (s === "meq/l" || s === "mmol/l") return "mmol/L";
  if (s === "u/l" || s === "iu/l") return "U/L";
  if (s === "miu/l") return "mIU/L";
  if (s === "mg/l") return "mg/L";
  if (s === "mm/hr") return "mm/hr";
  if (s.includes("million") || s.includes("cumm")) return "million/µL";
  if (s.includes("thousand") || s.includes("10^3")) return "thousand/µL";
  return u.trim();
}

/**
 * Normalizes rule strings
 */
function normalizeRule(rule) {
  if (!rule || typeof rule !== "string") return null;
  const r = rule.trim().toUpperCase();
  if (r === ">=" || r === "GTE" || r === "GREATER_THAN_OR_EQUAL") return "GREATER_THAN_OR_EQUAL";
  if (r === ">" || r === "GT" || r === "GREATER_THAN") return "GREATER_THAN";
  if (r === "<=" || r === "LTE" || r === "LESS_THAN_OR_EQUAL") return "LESS_THAN_OR_EQUAL";
  if (r === "<" || r === "LT" || r === "LESS_THAN") return "LESS_THAN";
  return null;
}

/**
 * Evaluates a single lab component using:
 * Priority 1 (OCR) -> Priority 2 (Fallback Registry) -> Priority 3 (UNKNOWN)
 *
 * @param {Object} params
 * @returns {Object} Canonical component data structure
 */
function evaluateComponent({
  testName,
  value,
  unit,
  referenceLow,
  referenceHigh,
  referenceRule,
  referenceOperator,
  referenceThreshold,
  referenceText,
  sourcePrintedStatus,
}) {
  const name = testName || "Unknown Test";
  const numVal = (value !== null && value !== undefined && !isNaN(parseFloat(value)))
    ? parseFloat(value)
    : null;

  // Find fallback entry by testName or alias
  const fallback = findFallbackRange(name);
  const canonicalName = fallback ? fallback.testName : name;
  const normUnit = normalizeLabUnit(unit) || (fallback ? fallback.unit : "");

  let resolvedLow = null;
  let resolvedHigh = null;
  let resolvedRule = null;
  let resolvedThreshold = null;
  let resolvedSource = "UNAVAILABLE";
  let resolvedText = null;
  let finalStatus = "UNKNOWN";

  // Check if OCR reference range was provided (Priority 1)
  let ocrParsed = null;
  if (referenceText) {
    ocrParsed = parseOcrReferenceRange(referenceText);
  }

  // Parse candidate OCR low/high
  const candidateLow = (referenceLow !== undefined && referenceLow !== null && !isNaN(parseFloat(referenceLow)))
    ? parseFloat(referenceLow)
    : (ocrParsed && ocrParsed.low !== undefined ? ocrParsed.low : null);

  const candidateHigh = (referenceHigh !== undefined && referenceHigh !== null && !isNaN(parseFloat(referenceHigh)))
    ? parseFloat(referenceHigh)
    : (ocrParsed && ocrParsed.high !== undefined ? ocrParsed.high : null);

  let rawRule = referenceRule || referenceOperator || (ocrParsed ? ocrParsed.rule : null);
  const candidateRule = normalizeRule(rawRule);

  let candidateThreshold = (referenceThreshold !== undefined && referenceThreshold !== null && !isNaN(parseFloat(referenceThreshold)))
    ? parseFloat(referenceThreshold)
    : (ocrParsed && ocrParsed.threshold !== undefined ? ocrParsed.threshold : null);

  if (candidateThreshold === null && candidateRule) {
    if (candidateRule === "GREATER_THAN_OR_EQUAL" || candidateRule === "GREATER_THAN") {
      candidateThreshold = candidateLow;
    } else if (candidateRule === "LESS_THAN_OR_EQUAL" || candidateRule === "LESS_THAN") {
      candidateThreshold = candidateHigh;
    }
  }

  // Check usability of candidate OCR range
  const ocrUsable = candidateLow !== null && candidateHigh !== null && isRangeUsable(candidateLow, candidateHigh, fallback);

  if (ocrUsable) {
    // Priority 1: Usable two-sided OCR range
    resolvedLow = candidateLow;
    resolvedHigh = candidateHigh;
    resolvedSource = "OCR_REPORT";
    resolvedText = referenceText || `${resolvedLow}–${resolvedHigh} ${normUnit}`.trim();
    finalStatus = calculateLabStatus(numVal, resolvedLow, resolvedHigh);
  } else if (candidateRule && candidateThreshold !== null) {
    // Priority 1: Usable one-sided OCR rule
    resolvedRule = candidateRule;
    resolvedThreshold = candidateThreshold;
    resolvedSource = "OCR_REPORT";
    resolvedText = referenceText || (candidateRule === "LESS_THAN" ? `< ${resolvedThreshold} ${normUnit}` : `>= ${resolvedThreshold} ${normUnit}`).trim();
    finalStatus = calculateThresholdStatus(numVal, resolvedRule, resolvedThreshold);
  } else if (fallback) {
    // Priority 2: 50-component Fallback Registry
    if (fallback.low !== undefined && fallback.high !== undefined) {
      resolvedLow = fallback.low;
      resolvedHigh = fallback.high;
      resolvedSource = "FALLBACK_REGISTRY";
      resolvedText = `${resolvedLow}–${resolvedHigh} ${normUnit || fallback.unit}`.trim();
      finalStatus = calculateLabStatus(numVal, resolvedLow, resolvedHigh);
    } else if (fallback.rule && fallback.threshold !== undefined) {
      resolvedRule = fallback.rule;
      resolvedThreshold = fallback.threshold;
      resolvedSource = "FALLBACK_REGISTRY";
      resolvedText = fallback.referenceText || (fallback.rule === "LESS_THAN" ? `< ${fallback.threshold} ${normUnit || fallback.unit}` : `>= ${fallback.threshold} ${normUnit || fallback.unit}`).trim();
      finalStatus = calculateThresholdStatus(numVal, resolvedRule, resolvedThreshold);
    }
  } else {
    // Priority 3: Neither exists -> UNKNOWN (NEVER assume NORMAL!)
    resolvedLow = null;
    resolvedHigh = null;
    resolvedSource = "UNAVAILABLE";
    resolvedText = "Not specified";
    finalStatus = "UNKNOWN";
  }

  // If value is missing / NaN, status must always be UNKNOWN
  if (numVal === null) {
    finalStatus = "UNKNOWN";
  }

  return {
    testName: canonicalName,
    name: canonicalName,
    marker: canonicalName,
    value: numVal,
    unit: normUnit,
    referenceLow: resolvedLow,
    referenceHigh: resolvedHigh,
    referenceRule: resolvedRule,
    referenceThreshold: resolvedThreshold,
    referenceSource: resolvedSource,
    referenceText: resolvedText || "Not specified",
    status: finalStatus,
    calculatedStatus: finalStatus,
    sourcePrintedStatus: sourcePrintedStatus || null,
    valueOf() { return numVal !== null ? numVal : 0; },
    toString() { return String(numVal !== null ? numVal : 0); },
  };
}

/**
 * Evaluates a dictionary of extracted laboratory components
 * @param {Object} rawComponents
 * @returns {Object} Map of evaluated component objects
 */
function evaluateLabComponents(rawComponents) {
  if (!rawComponents || typeof rawComponents !== "object") return {};
  const results = {};

  for (const [key, item] of Object.entries(rawComponents)) {
    if (item === null || item === undefined) continue;

    let evalParams;
    if (typeof item === "object" && "value" in item) {
      evalParams = {
        testName: item.testName || item.name || key,
        value: item.value,
        unit: item.unit,
        referenceLow: item.referenceLow,
        referenceHigh: item.referenceHigh,
        referenceRule: item.referenceRule || item.rule,
        referenceOperator: item.referenceOperator || item.op,
        referenceThreshold: item.referenceThreshold || item.threshold,
        referenceText: item.referenceText || item.refStr,
        sourcePrintedStatus: item.sourcePrintedStatus || item.flag,
      };
    } else {
      evalParams = {
        testName: key,
        value: item,
      };
    }

    const evaluated = evaluateComponent(evalParams);
    results[key] = evaluated;
  }

  return results;
}

module.exports = {
  calculateLabStatus,
  calculateThresholdStatus,
  parseOcrReferenceRange,
  isRangeUsable,
  evaluateComponent,
  evaluateLabComponents,
  normalizeLabUnit,
};
