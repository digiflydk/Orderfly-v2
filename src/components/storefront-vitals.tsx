'use client';
import { useCallback, useRef } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { trackClientEvent } from '@/lib/analytics';
import { commercePage } from '@/lib/commerce-metrics';
import Cookies from 'js-cookie';
export function StorefrontVitals() {
  const initialPage = useRef<string>(typeof window === 'undefined' ? 'other' : commercePage(window.location.pathname));
  const report = useCallback((metric: {name: string; value: number; id: string}) => {
    try {
      const pageType = initialPage.current;
      if (pageType === 'other' || !['LCP','INP','CLS'].includes(metric.name)) return;
      const sessionId = Cookies.get('orderfly_session_id');
      if (!sessionId) return;
      trackClientEvent('web_vital', {metricName: metric.name, metricId: metric.id, value: metric.value, sessionId,
        pageType, deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop'});
    } catch { /* Measuring a page must never break it. */ }
  }, []);
  useReportWebVitals(report);
  return null;
}
