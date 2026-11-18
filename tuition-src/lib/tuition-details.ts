const documentIds = {
  upperIep: "1uQ2eEDlt4aVbsusnLNCH2mMOFEfKAvtj",
  lowerRegular: "1P8PfZiJQu1b9QmpGaPhvGgc6qWHswl9U",
  japanese: "1R-ADB0pKYpckRpSdZ-A7S6Nf8D4eAm2q",
  upperRegular: "1CCRcFCwgsgi4glw2WA7ukKWtQA0UnvpH",
  lowerEsmp: "1Q6-XfE5YxzEkO2nCdTrCeOP6RvkKloXU",
  french: "12FKpOMAEtghASTCAzp_OnkCR1uNXweCX",
  lowerIep: "1C6ehBFGoMF2QiJbeZv4rM9x7BA8y3qCs",
  upperEsmp: "1MEYG_rttECXLgRnr2KmR4KwXBfCimRGf",
  chinese: "1ey21LoD6LROk_cYx472LNW-9EfbTxWYf",
};

const programDocuments = new Map([
  ["ปกติ", [documentIds.lowerRegular, documentIds.upperRegular]],
  ["ESMP", [documentIds.lowerEsmp, documentIds.upperEsmp]],
  ["IEP", [documentIds.lowerIep, documentIds.upperIep]],
]);

const upperLanguageDocuments = new Map([
  ["จีน", documentIds.chinese],
  ["ญี่ปุ่น", documentIds.japanese],
  ["ฝรั่งเศส", documentIds.french],
]);

export function getTuitionDetailsUrl(classRoom: string, studyProgram?: string) {
  const gradeMatch = classRoom.trim().match(/^(?:ม\.\s*)?([1-6])(?:\s*\/\s*\d+)?$/);
  if (!gradeMatch || !studyProgram) return undefined;

  const isUpperSecondary = Number(gradeMatch[1]) >= 4;
  const program = studyProgram.trim().toUpperCase();
  const documents = programDocuments.get(program);
  const id = documents?.[isUpperSecondary ? 1 : 0]
    ?? (isUpperSecondary ? upperLanguageDocuments.get(program) : undefined);

  return id ? `https://drive.google.com/file/d/${id}/view` : undefined;
}
