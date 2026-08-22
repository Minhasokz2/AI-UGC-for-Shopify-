import { useEffect, useState } from 'react';
import { fetchPricing } from '../lib/apiClient.js';
import { formatCentsToDollars } from '../lib/formatCurrency.js';

export default function Pricing() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'loaded' | 'error'
  const [pricing, setPricing] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  useEffect(() => {
    let cancelled = false;

    fetchPricing()
      .then((data) => {
        if (cancelled) return;
        setPricing(data);
        setStatus('loaded');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pricing-page">
      <h1 style={{ textAlign: 'center' }}>Pricing</h1>
      <p style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
        Pay for the credits you use, or go unlimited.
      </p>

      {status === 'loading' && (
        <p className="pricing-status" role="status">
          Loading pricing…
        </p>
      )}

      {status === 'error' && (
        <p className="pricing-status" role="alert">
          Couldn&rsquo;t load pricing right now. Please try again later.
        </p>
      )}

      {status === 'loaded' && pricing && (
        <>
          <div className="pricing-toggle" role="group" aria-label="Billing cycle">
            <button
              type="button"
              aria-pressed={billingCycle === 'monthly'}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billingCycle === 'annual'}
              onClick={() => setBillingCycle('annual')}
            >
              Annual
            </button>
          </div>

          <div className="pricing-grid">
            {pricing.packs.map((pack) => {
              const priceCents =
                billingCycle === 'monthly' ? pack.monthlyPriceCents : pack.annualPriceCents;
              const credits =
                billingCycle === 'monthly' ? pack.monthlyCredits : pack.annualCredits;
              return (
                <div className="pricing-card" key={pack.id}>
                  <h3>{pack.label}</h3>
                  <div className="pricing-card__price">
                    {formatCentsToDollars(priceCents)}
                    <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>
                      /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>
                  <div className="pricing-card__credits">{credits} credits</div>
                </div>
              );
            })}
          </div>

          {pricing.unlimitedPlan && (
            <div className="pricing-unlimited">
              <h3>{pricing.unlimitedPlan.label}</h3>
              <div className="pricing-card__price">
                {formatCentsToDollars(pricing.unlimitedPlan.monthlyPriceCents)}
                <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>/mo</span>
              </div>
              <p className="pricing-card__credits">Unlimited generations, flat monthly rate.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
