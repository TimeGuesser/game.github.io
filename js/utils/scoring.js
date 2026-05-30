export function calcPoints(userLat, userLng, userYear, correctLat, correctLng, correctYear) {
  const R = 6371;
  const dLat = (correctLat - userLat) * Math.PI / 180;
  const dLng = (correctLng - userLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(userLat * Math.PI / 180) * Math.cos(correctLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const yearDiff = Math.abs(userYear - correctYear);
  const pointsYear = Math.max(0, 500 - yearDiff * 10);

  let pointsDist = 0;
  if (distKm <= 0.15) {
    pointsDist = 500;
  } else if (distKm <= 100) {
    pointsDist = Math.round(350 + (500 - 350) * (1 - (distKm - 0.15) / (100 - 0.15)));
  } else if (distKm <= 250) {
    pointsDist = Math.round(250 + (350 - 250) * (1 - (distKm - 100) / (250 - 100)));
  } else if (distKm <= 500) {
    pointsDist = Math.round(100 + (250 - 100) * (1 - (distKm - 250) / (500 - 250)));
  } else if (distKm <= 1000) {
    pointsDist = Math.round(50 + (100 - 50) * (1 - (distKm - 500) / (1000 - 500)));
  } else if (distKm <= 2500) {
    pointsDist = Math.round(50 * (1 - (distKm - 1000) / (2500 - 1000)));
  }

  return { total: pointsYear + pointsDist, distKm, yearDiff, pointsYear, pointsDist };
}
