import { brand } from '@repo/config/brand';
import type { Guide } from '../types.ts';

/** Every date, threshold and penalty here is from the GOV.UK pages in `sources`, read on 13 October 2026. */
export const makingTaxDigitalForDrivingInstructors: Guide = {
  slug: 'making-tax-digital-for-driving-instructors',
  audience: 'instructors',
  title: 'Making Tax Digital for driving instructors: what changes in 2026, 2027 and 2028',
  description:
    'When Making Tax Digital for Income Tax applies to a driving instructor, why it counts your takings rather than your profit, and the quarterly deadlines.',
  summary:
    'Self-employed driving instructors are moving to digital records and a short update to HMRC every quarter. When it starts for you depends on what you took in lesson fees, and the threshold comes down every year.',
  published: '2026-10-13',
  updated: '2026-10-13',
  body: `
    ## What Making Tax Digital for Income Tax is

    Making Tax Digital for Income Tax changes how self-employed people keep their books and tell HMRC
    about them. Instead of gathering a year of receipts for one Self Assessment return, you keep
    digital records as you go and send HMRC a short update every quarter, using software HMRC
    recognises.

    A quarterly update is a summary: the totals for each kind of income and expense. HMRC does not
    receive your receipts or invoices. You still send a tax return for the year, and you still pay
    your tax by 31 January after the tax year ends, as you do now.

    ## When it applies to you

    It applies once your qualifying income passes a threshold, and the threshold comes down each year:

    | Qualifying income | In the tax year | You use Making Tax Digital from |
    |---|---|---|
    | Over £50,000 | 2024 to 2025 | 6 April 2026 |
    | Over £30,000 | 2025 to 2026 | 6 April 2027 |
    | Over £20,000 | 2026 to 2027 | 6 April 2028 |

    HMRC checks the Self Assessment return you sent for the year in the middle column, and writes to
    you when you need to start.

    ## It counts your takings, not your profit

    This is the part that catches driving instructors out. Qualifying income is your total income
    from self-employment and property **before expenses**: your turnover, not your profit.

    An instructor's costs are high. Fuel, insurance, the car itself and, for many, a franchise fee
    all come off before anything is profit. None of them comes off qualifying income. An instructor
    who takes £34,000 in lesson fees in the 2025 to 2026 tax year uses Making Tax Digital from April
    2027, however much lower their profit is.

    If you also have income from property, such as rent from a flat you let, it is added to what you
    take in lesson fees.

    ## The quarterly deadlines

    Each update covers the tax year so far, and is due on the 7th, about a month after its period ends:

    | Update period | Send it by |
    |---|---|
    | 6 April to 5 July | 7 August |
    | 6 April to 5 October | 7 November |
    | 6 April to 5 January | 7 February |
    | 6 April to 5 April | 7 May |

    You can choose calendar quarters instead, from 1 April to 30 June and so on, and the deadlines
    stay the same.

    In your first year, you still send the previous year's tax return the usual way. If you started
    in April 2026, your return for 2025 to 2026 is due by 31 January 2027, and your first return
    under the new rules, for 2026 to 2027, by 31 January 2028.

    ## Penalties for a late update

    HMRC is not giving penalty points for late quarterly updates in the 2026 to 2027 tax year, though
    every update still has to be sent before you can file your return. After that, each late update
    earns a penalty point, and at 4 points you get a £200 penalty. Points already apply to late tax
    returns, and penalties for paying late are separate.

    ## What to do now

    1. Find your last Self Assessment return and check your turnover against the table above.
    2. Record every lesson payment as it happens, whether it came by card, cash or bank transfer.
    3. Photograph the receipt for every cost you claim, and keep it with the record.
    4. Choose software HMRC recognises to send your updates, or an accountant who will send them for you.
    5. Sign up on GOV.UK when HMRC writes to you, or before, if you would rather start early.

    ## Where ${brand.name} fits

    ${brand.name} records every lesson payment as it happens, by card, cash or bank transfer, and on
    Pro keeps your expenses with a photo of each receipt. It exports your income and expenses by tax
    year and by quarter, ready for the software you send updates with or for your accountant. It does
    not send updates to HMRC itself. [See how it works for instructors](/instructors-software).

    > This guide is general information, not tax advice. HMRC or an accountant can tell you how the
    > rules apply to you.
  `,
  questions: [
    {
      question: 'My profit is under £30,000. Do I still need Making Tax Digital?',
      answer:
        'It depends on your takings, not your profit. Qualifying income is your income before expenses, so an instructor who took over £30,000 in lesson fees in the 2025 to 2026 tax year needs it from 6 April 2027, whatever their profit.',
    },
    {
      question: 'Do I pay tax every quarter?',
      answer:
        'No. A quarterly update is a summary of your income and expenses so far. You pay your tax at the same times as under Self Assessment, with the bill for the year due by 31 January after it ends.',
    },
    {
      question: 'I teach part time and take under £20,000. When does it apply to me?',
      answer:
        'Not under the thresholds set so far. The lowest is over £20,000 in the 2026 to 2027 tax year, for April 2028. Keeping digital records now still makes your tax return easier.',
    },
    {
      question: 'Can my accountant send the updates for me?',
      answer: 'Yes. An accountant or other agent can sign you up and send your quarterly updates for you.',
    },
  ],
  sources: [
    {
      label: 'GOV.UK: Find out if and when you need to use Making Tax Digital for Income Tax',
      url: 'https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax',
    },
    {
      label: 'GOV.UK: Work out your qualifying income for Making Tax Digital for Income Tax',
      url: 'https://www.gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax',
    },
    {
      label: 'GOV.UK: Send quarterly updates',
      url: 'https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates',
    },
    { label: 'GOV.UK: Penalties for Making Tax Digital for Income Tax', url: 'https://www.gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax' },
    { label: 'GOV.UK: Sign up for Making Tax Digital for Income Tax', url: 'https://www.gov.uk/guidance/sign-up-for-making-tax-digital-for-income-tax' },
  ],
  related: ['driving-instructor-expenses'],
};
