/**
 * backend/tests/verify_current_report.js
 * =========================================================================
 * Full OCR extraction and lab status engine evaluation on current uploaded report
 */

const { extractTextFromImage, parseMedicalIndicators } = require("../core/services/ocr.service");
const { findFallbackRange } = require("../config/labReferenceRanges");
const { getMedicalIndicatorStatus } = require("../modules/track/track.service");

(async () => {
  console.log("Running OCR on uploads/1775141948949-animea.jpeg...");
  const text = await extractTextFromImage("uploads/1775141948949-animea.jpeg");
  const rawIndicators = parseMedicalIndicators(text);
  const evaluated = getMedicalIndicatorStatus(rawIndicators, "female");

  console.log("\n===============================================================================================================");
  console.log("CURRENT REPORT OCR & STATUS EVALUATION TABLE (uploads/1775141948949-animea.jpeg)");
  console.log("===============================================================================================================");
  console.log(
    "TEST NAME".padEnd(20) +
    "VALUE".padEnd(8) +
    "UNIT".padEnd(14) +
    "OCR REF".padEnd(16) +
    "FALLBACK REF".padEnd(18) +
    "FINAL REF".padEnd(18) +
    "SOURCE".padEnd(20) +
    "STATUS"
  );
  console.log("-".repeat(110));

  for (const [key, item] of Object.entries(evaluated)) {
    // Only display canonical test once
    const fallback = findFallbackRange(key);
    const fallbackRef = fallback
      ? (fallback.low != null ? `${fallback.low}–${fallback.high}` : (fallback.referenceText || "Rule"))
      : "None";

    const isOcr = item.referenceSource === "OCR_REPORT";
    const ocrRef = isOcr ? item.referenceText : (item.referenceText ? "Invalid/Corrupt" : "None");

    console.log(
      key.padEnd(20) +
      String(item.value).padEnd(8) +
      String(item.unit).padEnd(14) +
      String(isOcr ? item.referenceText : "N/A (corrupt)").padEnd(16) +
      String(fallbackRef).padEnd(18) +
      String(item.referenceText).padEnd(18) +
      String(item.referenceSource).padEnd(20) +
      String(item.status || item.calculatedStatus)
    );
  }

  console.log("===============================================================================================================\n");
})();
