import { expect } from 'chai';
import stakeSetEvents from "./data/events-stakeSet.json"
import drawEvents from "./data/events-draw.json"
import disputeCreationEvents from "./data/events-disputeCreation.json"
import appealDecisionEvents from "./data/events-appealDecision.json"
import {handleStakeSet, handleDraw, handleDisputeCreation, handleAppealDecision} from "./src/KlerosLiquidMappings";
import {BigInt2, Court, KlerosCounter, store} from "./src/mocks";
import {
    DuneEventTx,
    DuneStakeSetEventTx,
    StakeSetEventFromTxEvent,
    DuneDrawEventTx,
    DrawEventFromTxEvent,
    DuneDisputeCreationEventTx,
    DisputeCreationEventFromTxEvent,
    DuneAppealDecisionEventTx,
    AppealDecisionEventFromTxEvent,
} from "./src/helpers";

// merge events
const addEventType = (events: DuneEventTx[], eventType: string) => {
    return events.map((event) => {
        event.kleros_evt_type = eventType
        return event
    })
}

const allEvents = []
    .concat(
        addEventType(stakeSetEvents, 'stakeSet'),
        addEventType(drawEvents, 'draw'),
        addEventType(disputeCreationEvents, 'disputeCreation'),
        addEventType(appealDecisionEvents, 'appealDecision'),
    )
    .sort(function(a: DuneEventTx, b: DuneEventTx) {
        if (a.evt_block_number !== b.evt_block_number) {
            return a.evt_block_number < b.evt_block_number ? -1 : 1;
        }

        return a.evt_index < b.evt_index ? -1 : 1;
    })

// staking_search_block = 12730954
// dispute_search_block = 12489369

interface CourtValues {
    id: number
    activeJurors: number
    totalStaked: number
}

const courtsValues: CourtValues[] = [
    {
        "id": 0,
        "activeJurors": 785,
        "totalStaked": 158342085
    },
    {
        "id": 1,
        "activeJurors": 86,
        "totalStaked": 8227316
    },
    {
        "id": 2,
        "activeJurors": 65,
        "totalStaked": 3989547
    },
    {
        "id": 3,
        "activeJurors": 10,
        "totalStaked": 1791004
    },
    {
        "id": 4,
        "activeJurors": 16,
        "totalStaked": 4004128
    },
    {
        "id": 5,
        "activeJurors": 15,
        "totalStaked": 748654
    },
    {
        "id": 6,
        "activeJurors": 73,
        "totalStaked": 1738535
    },
    {
        "id": 7,
        "activeJurors": 10,
        "totalStaked": 15869378
    },
    {
        "id": 8,
        "activeJurors": 206,
        "totalStaked": 3034941
    },
    {
        "id": 9,
        "activeJurors": 44,
        "totalStaked": 1411685
    },
    {
        "id": 10,
        "activeJurors": 26,
        "totalStaked": 958000
    },
    {
        "id": 11,
        "activeJurors": 10,
        "totalStaked": 754183
    },
    {
        "id": 12,
        "activeJurors": 9,
        "totalStaked": 409983
    },
    {
        "id": 13,
        "activeJurors": 9,
        "totalStaked": 40460
    },
    {
        "id": 14,
        "activeJurors": 4,
        "totalStaked": 12306
    },
    {
        "id": 15,
        "activeJurors": 2,
        "totalStaked": 103547
    },
    {
        "id": 16,
        "activeJurors": 9,
        "totalStaked": 90689
    },
    {
        "id": 17,
        "activeJurors": 6,
        "totalStaked": 49938
    },
    {
        "id": 18,
        "activeJurors": 0,
        "totalStaked": 0
    },
    {
        "id": 19,
        "activeJurors": 5,
        "totalStaked": 110701
    },
    {
        "id": 20,
        "activeJurors": 3,
        "totalStaked": 433066
    },
    {
        "id": 21,
        "activeJurors": 5,
        "totalStaked": 53157
    },
    {
        "id": 22,
        "activeJurors": 19,
        "totalStaked": 430178
    },
    {
        "id": 23,
        "activeJurors": 228,
        "totalStaked": 40764567
    }
]

describe('Test Court Totals', () => {
    allEvents.forEach(function(event: DuneEventTx) {
        if (event.kleros_evt_type === 'stakeSet') {
            handleStakeSet(StakeSetEventFromTxEvent(event as DuneStakeSetEventTx));
        } else if (event.kleros_evt_type === 'draw') {
            handleDraw(DrawEventFromTxEvent(event as DuneDrawEventTx));
        } else if (event.kleros_evt_type === 'disputeCreation') {
            handleDisputeCreation(DisputeCreationEventFromTxEvent(event as DuneDisputeCreationEventTx));
        } else if (event.kleros_evt_type === 'appealDecision') {
            handleAppealDecision(AppealDecisionEventFromTxEvent(event as DuneAppealDecisionEventTx));
        }
    });

    courtsValues.forEach((courtValue) => {
        it(`Test court ${courtValue.id}`, () => {
            const court = Court.load(String(courtValue.id))

            let activeJurors = 0
            let tokenStaked = 0

            if (court !== null) {
                activeJurors = court.activeJurors.toI32()
                tokenStaked = court.tokenStaked.toI32()
            }

            expect(
                activeJurors,
                'Invalid activeJurors'
            ).to.equal(courtValue.activeJurors);

            expect(
                Math.floor(tokenStaked * Math.pow(10, -18)),
                'Invalid tokenStaked'
            ).to.equal(courtValue.totalStaked);
        });
    })

    const counterValues = {
        // TODO: test all
        //courtsCount: BigInt2.fromI32(24),
        //disputesCount: BigInt2.fromI32(862),
        //openDisputes: BigInt2.fromI32(-1),
        //closedDisputes: BigInt2.fromI32(-1),
        //evidencePhaseDisputes: BigInt2.fromI32(15),
        //votingPhaseDisputes: BigInt2.fromI32(836),
        //appealPhaseDisputes: BigInt2.fromI32(0),
        activeJurors: BigInt2.fromI32(785),
        //inactiveJurors: BigInt2.fromI32(-1),
        //drawnJurors: BigInt2.fromI32(440),
        tokenStaked: BigInt2.fromI32(158342085),
        //totalETHFees: BigInt2.fromI32(348.746421855129),
        //totalPNKredistributed: BigInt2.fromI32(2343914.2),
        //totalUSDthroughContract: BigInt2.fromI32(-1),
    }

    const klerosCounter = KlerosCounter.load('ID')

    Object
        .keys(counterValues)
        .forEach((key: string) => {
            it(`Test ${key} counter`, () => {
                let value = (klerosCounter[key] as BigInt2).toString()
                if (key === 'tokenStaked') {
                    value = value.substr(0, 9)
                }

                expect(
                    value
                ).to.equal((counterValues[key] as BigInt2).toString());
            })
        })

});