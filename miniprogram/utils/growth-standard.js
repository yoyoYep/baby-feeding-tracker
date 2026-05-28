// WHO Child Growth Standards - LMS Parameters (0-24 months, monthly)
// Source: WHO Multicentre Growth Reference Study (MGRS)
// Method: Z = ((value/M)^L - 1) / (L*S), Percentile = Φ(Z) * 100

// Weight-for-age LMS - Boys
const weightBoyLMS = [
  { L: 0.3487, M: 3.3464, S: 0.14602 },
  { L: 0.2297, M: 4.4709, S: 0.13395 },
  { L: 0.1970, M: 5.5675, S: 0.12385 },
  { L: 0.1738, M: 6.3762, S: 0.11727 },
  { L: 0.1553, M: 7.0023, S: 0.11316 },
  { L: 0.1395, M: 7.5105, S: 0.11080 },
  { L: 0.1257, M: 7.9340, S: 0.10958 },
  { L: 0.1134, M: 8.2970, S: 0.10902 },
  { L: 0.1021, M: 8.6151, S: 0.10882 },
  { L: 0.0917, M: 8.9014, S: 0.10881 },
  { L: 0.0820, M: 9.1649, S: 0.10891 },
  { L: 0.0730, M: 9.4122, S: 0.10906 },
  { L: 0.0644, M: 9.6479, S: 0.10925 },
  { L: 0.0563, M: 9.8749, S: 0.10949 },
  { L: 0.0487, M: 10.0953, S: 0.10976 },
  { L: 0.0413, M: 10.3108, S: 0.11007 },
  { L: 0.0343, M: 10.5228, S: 0.11041 },
  { L: 0.0275, M: 10.7319, S: 0.11079 },
  { L: 0.0211, M: 10.9385, S: 0.11119 },
  { L: 0.0148, M: 11.1430, S: 0.11164 },
  { L: 0.0087, M: 11.3462, S: 0.11211 },
  { L: 0.0029, M: 11.5486, S: 0.11261 },
  { L: -0.0028, M: 11.7504, S: 0.11314 },
  { L: -0.0083, M: 11.9514, S: 0.11369 },
  { L: -0.0137, M: 12.1515, S: 0.11426 }
]

// Weight-for-age LMS - Girls
const weightGirlLMS = [
  { L: 0.3809, M: 3.2322, S: 0.14171 },
  { L: 0.1714, M: 4.1873, S: 0.13724 },
  { L: 0.0962, M: 5.1282, S: 0.12635 },
  { L: 0.0402, M: 5.8458, S: 0.11947 },
  { L: -0.0050, M: 6.4237, S: 0.11494 },
  { L: -0.0430, M: 6.8985, S: 0.11205 },
  { L: -0.0756, M: 7.2970, S: 0.11020 },
  { L: -0.1039, M: 7.6422, S: 0.10906 },
  { L: -0.1288, M: 7.9487, S: 0.10838 },
  { L: -0.1507, M: 8.2254, S: 0.10804 },
  { L: -0.1700, M: 8.4800, S: 0.10795 },
  { L: -0.1872, M: 8.7192, S: 0.10803 },
  { L: -0.2024, M: 8.9481, S: 0.10823 },
  { L: -0.2158, M: 9.1699, S: 0.10853 },
  { L: -0.2278, M: 9.3870, S: 0.10891 },
  { L: -0.2384, M: 9.6008, S: 0.10936 },
  { L: -0.2478, M: 9.8124, S: 0.10985 },
  { L: -0.2562, M: 10.0226, S: 0.11039 },
  { L: -0.2637, M: 10.2315, S: 0.11097 },
  { L: -0.2703, M: 10.4393, S: 0.11158 },
  { L: -0.2762, M: 10.6464, S: 0.11222 },
  { L: -0.2815, M: 10.8534, S: 0.11289 },
  { L: -0.2862, M: 11.0608, S: 0.11359 },
  { L: -0.2903, M: 11.2688, S: 0.11431 },
  { L: -0.2941, M: 11.4775, S: 0.11505 }
]

// Length-for-age LMS - Boys
const lengthBoyLMS = [
  { L: 1, M: 49.8842, S: 0.03795 },
  { L: 1, M: 54.7244, S: 0.03557 },
  { L: 1, M: 58.4249, S: 0.03424 },
  { L: 1, M: 61.4292, S: 0.03328 },
  { L: 1, M: 63.8860, S: 0.03257 },
  { L: 1, M: 65.9026, S: 0.03204 },
  { L: 1, M: 67.6236, S: 0.03165 },
  { L: 1, M: 69.1645, S: 0.03139 },
  { L: 1, M: 70.5994, S: 0.03124 },
  { L: 1, M: 71.9687, S: 0.03117 },
  { L: 1, M: 73.2812, S: 0.03118 },
  { L: 1, M: 74.5388, S: 0.03125 },
  { L: 1, M: 75.7488, S: 0.03137 },
  { L: 1, M: 76.9186, S: 0.03154 },
  { L: 1, M: 78.0497, S: 0.03174 },
  { L: 1, M: 79.1458, S: 0.03197 },
  { L: 1, M: 80.2113, S: 0.03222 },
  { L: 1, M: 81.2487, S: 0.03248 },
  { L: 1, M: 82.2587, S: 0.03277 },
  { L: 1, M: 83.2418, S: 0.03307 },
  { L: 1, M: 84.1996, S: 0.03337 },
  { L: 1, M: 85.1348, S: 0.03369 },
  { L: 1, M: 86.0477, S: 0.03401 },
  { L: 1, M: 86.9412, S: 0.03435 },
  { L: 1, M: 87.8161, S: 0.03468 }
]

// Length-for-age LMS - Girls
const lengthGirlLMS = [
  { L: 1, M: 49.1477, S: 0.03790 },
  { L: 1, M: 53.6872, S: 0.03564 },
  { L: 1, M: 57.0673, S: 0.03468 },
  { L: 1, M: 59.8029, S: 0.03387 },
  { L: 1, M: 62.0899, S: 0.03327 },
  { L: 1, M: 64.0301, S: 0.03283 },
  { L: 1, M: 65.7311, S: 0.03249 },
  { L: 1, M: 67.2873, S: 0.03223 },
  { L: 1, M: 68.7498, S: 0.03204 },
  { L: 1, M: 70.1435, S: 0.03191 },
  { L: 1, M: 71.4818, S: 0.03183 },
  { L: 1, M: 72.7710, S: 0.03179 },
  { L: 1, M: 74.0153, S: 0.03179 },
  { L: 1, M: 75.2154, S: 0.03183 },
  { L: 1, M: 76.3723, S: 0.03189 },
  { L: 1, M: 77.4880, S: 0.03198 },
  { L: 1, M: 78.5639, S: 0.03209 },
  { L: 1, M: 79.6025, S: 0.03222 },
  { L: 1, M: 80.6051, S: 0.03237 },
  { L: 1, M: 81.5748, S: 0.03254 },
  { L: 1, M: 82.5137, S: 0.03272 },
  { L: 1, M: 83.4236, S: 0.03292 },
  { L: 1, M: 84.3065, S: 0.03313 },
  { L: 1, M: 85.1647, S: 0.03335 },
  { L: 1, M: 86.0000, S: 0.03358 }
]

// Head circumference-for-age LMS - Boys
const hcBoyLMS = [
  { L: 1, M: 34.4618, S: 0.03686 },
  { L: 1, M: 37.2759, S: 0.03133 },
  { L: 1, M: 39.1285, S: 0.02997 },
  { L: 1, M: 40.5135, S: 0.02918 },
  { L: 1, M: 41.6317, S: 0.02868 },
  { L: 1, M: 42.5576, S: 0.02837 },
  { L: 1, M: 43.3306, S: 0.02817 },
  { L: 1, M: 43.9803, S: 0.02804 },
  { L: 1, M: 44.5300, S: 0.02796 },
  { L: 1, M: 44.9998, S: 0.02792 },
  { L: 1, M: 45.4051, S: 0.02790 },
  { L: 1, M: 45.7573, S: 0.02789 },
  { L: 1, M: 46.0661, S: 0.02789 },
  { L: 1, M: 46.3395, S: 0.02789 },
  { L: 1, M: 46.5844, S: 0.02791 },
  { L: 1, M: 46.8060, S: 0.02793 },
  { L: 1, M: 47.0088, S: 0.02795 },
  { L: 1, M: 47.1962, S: 0.02797 },
  { L: 1, M: 47.3711, S: 0.02799 },
  { L: 1, M: 47.5357, S: 0.02801 },
  { L: 1, M: 47.6919, S: 0.02803 },
  { L: 1, M: 47.8408, S: 0.02806 },
  { L: 1, M: 47.9833, S: 0.02808 },
  { L: 1, M: 48.1201, S: 0.02811 },
  { L: 1, M: 48.2515, S: 0.02813 }
]

// Head circumference-for-age LMS - Girls
const hcGirlLMS = [
  { L: 1, M: 33.8787, S: 0.03496 },
  { L: 1, M: 36.5463, S: 0.03078 },
  { L: 1, M: 38.2521, S: 0.02960 },
  { L: 1, M: 39.5328, S: 0.02892 },
  { L: 1, M: 40.5817, S: 0.02850 },
  { L: 1, M: 41.4590, S: 0.02822 },
  { L: 1, M: 42.1995, S: 0.02802 },
  { L: 1, M: 42.8290, S: 0.02788 },
  { L: 1, M: 43.3671, S: 0.02779 },
  { L: 1, M: 43.8300, S: 0.02772 },
  { L: 1, M: 44.2319, S: 0.02768 },
  { L: 1, M: 44.5844, S: 0.02765 },
  { L: 1, M: 44.8965, S: 0.02762 },
  { L: 1, M: 45.1752, S: 0.02760 },
  { L: 1, M: 45.4265, S: 0.02759 },
  { L: 1, M: 45.6550, S: 0.02757 },
  { L: 1, M: 45.8650, S: 0.02756 },
  { L: 1, M: 46.0598, S: 0.02755 },
  { L: 1, M: 46.2424, S: 0.02754 },
  { L: 1, M: 46.4152, S: 0.02753 },
  { L: 1, M: 46.5801, S: 0.02752 },
  { L: 1, M: 46.7384, S: 0.02752 },
  { L: 1, M: 46.8913, S: 0.02752 },
  { L: 1, M: 47.0391, S: 0.02752 },
  { L: 1, M: 47.1822, S: 0.02752 }
]

function getLMS(monthAge, gender, metric) {
  let table
  if (metric === 'weight') table = gender === 'male' ? weightBoyLMS : weightGirlLMS
  else if (metric === 'length') table = gender === 'male' ? lengthBoyLMS : lengthGirlLMS
  else table = gender === 'male' ? hcBoyLMS : hcGirlLMS

  const month = Math.max(0, Math.min(24, monthAge))
  const lower = Math.floor(month)
  const upper = Math.min(lower + 1, 24)
  const frac = month - lower

  return {
    L: table[lower].L + frac * (table[upper].L - table[lower].L),
    M: table[lower].M + frac * (table[upper].M - table[lower].M),
    S: table[lower].S + frac * (table[upper].S - table[lower].S)
  }
}

function zScore(value, L, M, S) {
  if (Math.abs(L) < 0.001) return Math.log(value / M) / S
  return (Math.pow(value / M, L) - 1) / (L * S)
}

// Normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z) {
  if (z < -6) return 0
  if (z > 6) return 1
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

function getPercentile(value, monthAge, gender, metric) {
  const { L, M, S } = getLMS(monthAge, gender, metric)
  const z = zScore(value, L, M, S)
  const percentile = Math.round(normalCDF(z) * 1000) / 10
  return { percentile, label: percentile.toFixed(1) + '%' }
}

function getRefData(gender, metric) {
  const table = metric === 'weight'
    ? (gender === 'male' ? weightBoyLMS : weightGirlLMS)
    : metric === 'length'
      ? (gender === 'male' ? lengthBoyLMS : lengthGirlLMS)
      : (gender === 'male' ? hcBoyLMS : hcGirlLMS)

  const result = { P3: [], P10: [], P25: [], P50: [], P75: [], P90: [], P97: [] }
  const zValues = { P3: -1.881, P10: -1.282, P25: -0.674, P50: 0, P75: 0.674, P90: 1.282, P97: 1.881 }

  for (let m = 0; m <= 24; m++) {
    const { L, M, S } = table[m]
    for (const [key, z] of Object.entries(zValues)) {
      let val
      if (Math.abs(L) < 0.001) val = M * Math.exp(S * z)
      else val = M * Math.pow(1 + L * S * z, 1 / L)
      result[key].push(Math.round(val * 10) / 10)
    }
  }
  return result
}

const BANDS = [3, 10, 25, 50, 75, 90, 97]

module.exports = { getPercentile, getRefData, BANDS }
