import { expect } from 'chai';
import allEvents from "./data/events-all.json"
import {handleStakeSet} from "./src/KlerosLiquidMappings";
import {Court} from "./src/mocks";
import {DuneEventTx, StakeSetEventFromTxEvent} from "./src/helpers";

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
        handleStakeSet(StakeSetEventFromTxEvent(event));
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

});
