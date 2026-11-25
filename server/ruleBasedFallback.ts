export type AiFeatureType =
  | 'chat'
  | 'advice'
  | 'shift_plan'
  | 'photo_audit'
  | 'classify';

export type SupportedLanguage = 'en' | 'hi' | 'hinglish';

export interface HourlyForecastInput {
  hourLabel: string;
  us_aqi: number | null;
}

export interface RuleBasedContext {
  feature: AiFeatureType;
  role: string;
  aqiBand: string;
  aqi?: number;
  hoursOutside?: number;
  mainPollutant?: string;
  language: SupportedLanguage;
  question: string;
  hourly24?: HourlyForecastInput[];
}

const ROLE_LABELS: Record<string, { en: string; hi: string; hinglish: string }> = {
  delivery: {
    en: 'Delivery Rider',
    hi: 'डिलीवरी राइडर',
    hinglish: 'Delivery Rider',
  },
  driver: {
    en: 'Cab / Auto Driver',
    hi: 'कैब / ऑटो ड्राइवर',
    hinglish: 'Cab / Auto Driver',
  },
  vendor: {
    en: 'Street Vendor',
    hi: 'स्ट्रीट वेंडर',
    hinglish: 'Street Vendor',
  },
  police: {
    en: 'Traffic Police',
    hi: 'ट्रैफिक पुलिस',
    hinglish: 'Traffic Police',
  },
  general: {
    en: 'Outdoor Citizen',
    hi: 'आम नागरिक',
    hinglish: 'Outdoor Citizen',
  },
};

function isModerateBand(aqiBand: string): boolean {
  return aqiBand.toLowerCase().trim() === 'moderate';
}

function isGoodBand(aqiBand: string): boolean {
  return aqiBand.toLowerCase().trim() === 'good';
}

function getBestAndWorstHours(hourly24?: HourlyForecastInput[]): {
  best: string | null;
  worst: string | null;
} {
  if (!hourly24 || hourly24.length === 0) {
    return { best: null, worst: null };
  }
  const valid = hourly24.filter((h) => typeof h.us_aqi === 'number');
  if (valid.length === 0) return { best: null, worst: null };

  let minPoint = valid[0];
  let maxPoint = valid[0];
  for (const point of valid) {
    if ((point.us_aqi ?? 0) < (minPoint.us_aqi ?? 0)) minPoint = point;
    if ((point.us_aqi ?? 0) > (maxPoint.us_aqi ?? 0)) maxPoint = point;
  }
  return {
    best: `${minPoint.hourLabel} (~${Math.round(minPoint.us_aqi ?? 0)} AQI)`,
    worst: `${maxPoint.hourLabel} (~${Math.round(maxPoint.us_aqi ?? 0)} AQI)`,
  };
}

function getMaskStep(
  role: string,
  aqiBand: string,
  hoursOutside: number,
  pollutant: string,
  language: SupportedLanguage
): string {
  const highShift = hoursOutside >= 4;
  const openRoadRole = role === 'delivery' || role === 'police' || role === 'vendor';

  if (isGoodBand(aqiBand)) {
    if (language === 'hi') {
      return `1. अभी हवा साफ है, सामान्य काम के लिए मास्क की जरूरत नहीं है (धूल भरी सड़क पर ${hoursOutside} घंटे से ज्यादा रहने पर मास्क पास रखें)।`;
    }
    if (language === 'hinglish') {
      return `1. Abhi hawa saaf hai, aam shift mein mask zaroori nahi hai (agar dusty road par ${hoursOutside}+ ghante rehna ho toh mask paas rakhein).`;
    }
    return `1. Air is good right now, so a mask is not required for most shifts (keep one handy if working ${hoursOutside}+ hours on dusty roads).`;
  }

  if (isModerateBand(aqiBand)) {
    if (language === 'hi') {
      return `1. मध्यम AQI में भी अस्थमा, हृदय रोग, बच्चों और बुजुर्गों को मास्क पहनने पर विचार करना चाहिए। ${openRoadRole || highShift ? `बाहर ${hoursOutside} घंटे काम करने वाले व्यक्ति भारी ट्रैफिक में N95 मास्क पहनें।` : 'व्यस्त सड़क पर हल्का मास्क पास रखें।'}`;
    }
    if (language === 'hinglish') {
      return `1. Moderate AQI par bhi asthma, heart disease wale log, bachche aur buzurg mask pehenne par zaroor dhyan dein. ${openRoadRole || highShift ? `${hoursOutside} ghante bahar traffic mein kaam karne par N95 mask pehnein.` : 'Traffic ke paas N95 mask paas rakhein.'}`;
    }
    return `1. People with asthma, heart disease, children, and elders should consider wearing a mask even at Moderate AQI. ${
      openRoadRole || highShift
        ? `Because you spend ${hoursOutside} hours outside in traffic, wear a fitted N95 mask near heavy roads.`
        : `For ${hoursOutside} hours outdoors, keep an N95 mask ready near busy junctions.`
    }`;
  }

  if (language === 'hi') {
    return `1. बाहर ${hoursOutside} घंटे काम और मुख्य प्रदूषक ${pollutant} से बचाव के लिए टाइट N95 या FFP2 मास्क पहनें — कपड़े का रूमाल बारीक धूल नहीं रोकता। अस्थमा, हृदय रोग, बच्चों और बुजुर्गों को अतिरिक्त सावधानी रखनी चाहिए।`;
  }
  if (language === 'hinglish') {
    return `1. Bahar ${hoursOutside} ghante shift aur ${pollutant} se bachne ke liye tight N95 ya FFP2 mask pehnein — kapde ka mask fine dust nahi rokta. Asthma, heart disease, bachche aur buzurg khaas savdhani rakhein.`;
  }
  return `1. Wear a snug N95 or FFP2 mask for your ${hoursOutside}-hour shift against ${pollutant} — cloth scarves do not block fine particles. People with asthma, heart disease, children, and elders should minimize outdoor time.`;
}

export function buildRuleBasedAnswer(ctx: RuleBasedContext): string {
  if (ctx.feature === 'classify') {
    return '{"label":"on_topic"}';
  }

  const roleNames = ROLE_LABELS[ctx.role] ?? ROLE_LABELS.general;
  const roleName = roleNames[ctx.language];
  const hours = typeof ctx.hoursOutside === 'number' && ctx.hoursOutside > 0
    ? ctx.hoursOutside
    : ctx.role === 'general'
      ? 2
      : 8;
  const pollutant = ctx.mainPollutant || 'PM2.5';
  const aqiText = typeof ctx.aqi === 'number' ? `${ctx.aqi} (${ctx.aqiBand})` : ctx.aqiBand;
  const maskStep = getMaskStep(ctx.role, ctx.aqiBand, hours, pollutant, ctx.language);

  if (ctx.feature === 'advice') {
    if (ctx.language === 'hi') {
      return [
        maskStep,
        `2. ${roleName} (${aqiText}): भारी ट्रैफिक सिग्नल और बड़े वाहनों के धुएं से कुछ कदम पीछे हटकर इंतजार करें।`,
        `3. हर घंटे साफ पानी पिएं और ब्रेक में आंखों व चेहरे को सादे पानी से धोएं।`,
      ].join('\n');
    }
    if (ctx.language === 'hinglish') {
      return [
        maskStep,
        `2. ${roleName} (${aqiText}): Signal par diesel bus ya truck ke bilkul peeche rukne se bachein.`,
        `3. Har ghante saaf paani piyein aur break mein aankhon aur chehre ko paani se dho lein.`,
      ].join('\n');
    }
    return [
      maskStep,
      `2. Step back from idling diesel exhaust at signals and wait in quieter side lanes when possible (${roleName}, ${aqiText}).`,
      `3. Drink water every hour and rinse your eyes and face with clean water during breaks.`,
    ].join('\n');
  }

  if (ctx.feature === 'shift_plan') {
    const { best, worst } = getBestAndWorstHours(ctx.hourly24);
    if (ctx.language === 'hi') {
      return [
        maskStep,
        best
          ? `2. सबसे साफ समय: ${best} — कठिन या लंबे काम इस समय पूरे करें।`
          : `2. सुबह जल्दी काम शुरू करें जब ट्रैफिक धुआं कम हो (${hours} घंटे शिफ्ट)।`,
        worst
          ? `3. सबसे खराब समय: ${worst} — इस दौरान छाया या अंदर 10–15 मिनट का ब्रेक लें।`
          : `3. शाम के पीक ट्रैफिक में छोटे-छोटे ब्रेक अंदर लें।`,
      ].join('\n');
    }
    if (ctx.language === 'hinglish') {
      return [
        maskStep,
        best
          ? `2. Sabse saaf ghante: ${best} — heavy kaam is window mein karein.`
          : `2. Subah jaldi kaam shuru karein jab traffic kam ho (${hours} ghante shift).`,
        worst
          ? `3. Peak pollution time: ${worst} — is time side lane ya indoor shade mein 10–15 min break lein.`
          : `3. Shaam ke rush hour mein chhote indoor breaks lein.`,
      ].join('\n');
    }
    return [
      maskStep,
      best
        ? `2. Cleanest window: ${best} — schedule heavier outdoor tasks during these hours.`
        : `2. Start heavier outdoor tasks earlier in the day before traffic builds (${hours}-hour shift).`,
      worst
        ? `3. Peak pollution window: ${worst} — take 10 to 15 minute shaded or indoor breaks.`
        : `3. Plan short indoor breaks during evening rush hour.`,
    ].join('\n');
  }

  if (ctx.feature === 'photo_audit') {
    if (ctx.language === 'hi') {
      return [
        maskStep,
        `2. सुनिश्चित करें कि मास्क नाक के क्लिप पर पूरी तरह दबा हो और किनारों से हवा अंदर न जाए।`,
        `3. धूल या धुएं से बचने के लिए सड़क के किनारे से थोड़ा पीछे हटकर काम करें।`,
      ].join('\n');
    }
    if (ctx.language === 'hinglish') {
      return [
        maskStep,
        `2. Check karein ki mask ka nose clip naak par tight dabaya ho aur side se gap na ho.`,
        `3. Road ke bilkul edge ya exhaust ke saamne khade hone se bachein.`,
      ].join('\n');
    }
    return [
      maskStep,
      `2. Pinch the nose bridge firmly so no air leaks around the sides of the mask.`,
      `3. Step away from direct roadside exhaust and keep helmet visors or eye protection down in haze.`,
    ].join('\n');
  }

  // chat Q&A fallback
  if (ctx.language === 'hi') {
    return [
      maskStep,
      `2. ${roleName} (${aqiText}) के लिए मुख्य प्रदूषक ${pollutant} है — व्यस्त सड़कों के बजाय कम ट्रैफिक वाले रास्ते चुनें।`,
      `3. हर घंटे पानी पिएं और खांसी या जलन होने पर अंदर आराम करें।`,
    ].join('\n');
  }
  if (ctx.language === 'hinglish') {
    return [
      maskStep,
      `2. ${roleName} (${aqiText}) ke liye main pollutant ${pollutant} hai — busy highway ke badle side lanes use karein.`,
      `3. Har ghante paani piyein aur gale mein kharaash lage toh indoor break lein.`,
    ].join('\n');
  }
  return [
    maskStep,
    `2. For ${roleName} at ${aqiText} (${pollutant} main pollutant), pick side streets over congested truck corridors when possible.`,
    `3. Drink water regularly and take brief indoor breaks if you feel throat irritation.`,
  ].join('\n');
}
