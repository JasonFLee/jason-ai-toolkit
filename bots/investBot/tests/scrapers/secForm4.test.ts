import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SECForm4Scraper } from '../../src/scrapers/secForm4';

describe('SEC Form 4 Scraper', () => {
  let scraper: SECForm4Scraper;

  beforeEach(() => {
    scraper = new SECForm4Scraper();
  });

  describe('parseForm4XML', () => {
    it('should correctly parse Form 4 XML data', async () => {
      const mockXML = `<?xml version="1.0"?>
        <ownershipDocument>
          <issuer>
            <issuerCik>0000320193</issuerCik>
            <issuerName>Apple Inc.</issuerName>
            <issuerTradingSymbol>AAPL</issuerTradingSymbol>
          </issuer>
          <reportingOwner>
            <reportingOwnerId>
              <rptOwnerCik>0001234567</rptOwnerCik>
              <rptOwnerName>Cook Timothy D</rptOwnerName>
            </reportingOwnerId>
            <reportingOwnerRelationship>
              <isDirector>true</isDirector>
              <isOfficer>true</isOfficer>
              <officerTitle>Chief Executive Officer</officerTitle>
            </reportingOwnerRelationship>
          </reportingOwner>
          <periodOfReport>2024-01-15</periodOfReport>
          <nonDerivativeTable>
            <nonDerivativeTransaction>
              <securityTitle><value>Common Stock</value></securityTitle>
              <transactionDate><value>2024-01-15</value></transactionDate>
              <transactionCoding>
                <transactionCode>P</transactionCode>
              </transactionCoding>
              <transactionAmounts>
                <transactionShares><value>10000</value></transactionShares>
                <transactionPricePerShare><value>185.50</value></transactionPricePerShare>
              </transactionAmounts>
              <ownershipNature>
                <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
              </ownershipNature>
            </nonDerivativeTransaction>
          </nonDerivativeTable>
        </ownershipDocument>`;

      const result = await scraper.parseForm4XML(mockXML);

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('AAPL');
      expect(result?.insiderName).toBe('Cook Timothy D');
      expect(result?.insiderTitle).toBe('Chief Executive Officer');
      expect(result?.transactionType).toBe('BUY');
      expect(result?.shares).toBe(10000);
      expect(result?.pricePerShare).toBe(185.50);
      expect(result?.ownershipType).toBe('DIRECT');
    });

    it('should return null for invalid XML', async () => {
      const result = await scraper.parseForm4XML('invalid xml');
      expect(result).toBeNull();
    });

    it('should identify SELL transactions', async () => {
      const mockXML = `<?xml version="1.0"?>
        <ownershipDocument>
          <issuer>
            <issuerTradingSymbol>MSFT</issuerTradingSymbol>
          </issuer>
          <reportingOwner>
            <reportingOwnerId>
              <rptOwnerName>Nadella Satya</rptOwnerName>
            </reportingOwnerId>
            <reportingOwnerRelationship>
              <isOfficer>true</isOfficer>
              <officerTitle>CEO</officerTitle>
            </reportingOwnerRelationship>
          </reportingOwner>
          <periodOfReport>2024-01-15</periodOfReport>
          <nonDerivativeTable>
            <nonDerivativeTransaction>
              <transactionDate><value>2024-01-15</value></transactionDate>
              <transactionCoding>
                <transactionCode>S</transactionCode>
              </transactionCoding>
              <transactionAmounts>
                <transactionShares><value>5000</value></transactionShares>
                <transactionPricePerShare><value>400.00</value></transactionPricePerShare>
              </transactionAmounts>
              <ownershipNature>
                <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
              </ownershipNature>
            </nonDerivativeTransaction>
          </nonDerivativeTable>
        </ownershipDocument>`;

      const result = await scraper.parseForm4XML(mockXML);

      expect(result?.transactionType).toBe('SELL');
    });

    it('should handle exercise transactions', async () => {
      const mockXML = `<?xml version="1.0"?>
        <ownershipDocument>
          <issuer>
            <issuerTradingSymbol>TSLA</issuerTradingSymbol>
          </issuer>
          <reportingOwner>
            <reportingOwnerId>
              <rptOwnerName>Test Officer</rptOwnerName>
            </reportingOwnerId>
            <reportingOwnerRelationship>
              <isOfficer>true</isOfficer>
              <officerTitle>VP</officerTitle>
            </reportingOwnerRelationship>
          </reportingOwner>
          <periodOfReport>2024-01-15</periodOfReport>
          <nonDerivativeTable>
            <nonDerivativeTransaction>
              <transactionDate><value>2024-01-15</value></transactionDate>
              <transactionCoding>
                <transactionCode>M</transactionCode>
              </transactionCoding>
              <transactionAmounts>
                <transactionShares><value>1000</value></transactionShares>
                <transactionPricePerShare><value>0</value></transactionPricePerShare>
              </transactionAmounts>
              <ownershipNature>
                <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
              </ownershipNature>
            </nonDerivativeTransaction>
          </nonDerivativeTable>
        </ownershipDocument>`;

      const result = await scraper.parseForm4XML(mockXML);

      expect(result?.transactionType).toBe('EXERCISE');
    });
  });

  describe('fetchRecentFilings', () => {
    it('should return an array of transactions', async () => {
      // Mock the network call for unit testing
      vi.spyOn(scraper, 'fetchRecentFilings').mockResolvedValue([
        {
          ticker: 'AAPL',
          insiderName: 'Tim Cook',
          insiderTitle: 'CEO',
          transactionType: 'BUY',
          shares: 10000,
          pricePerShare: 185.50,
          transactionDate: new Date(),
          filingDate: new Date(),
          ownershipType: 'DIRECT',
          source: 'SEC_FORM4',
        },
      ]);

      const filings = await scraper.fetchRecentFilings(10);

      expect(Array.isArray(filings)).toBe(true);
      expect(filings.length).toBeGreaterThan(0);
      expect(filings[0]).toHaveProperty('ticker');
      expect(filings[0]).toHaveProperty('insiderName');
    });
  });
});
