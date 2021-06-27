import { expect } from 'chai';
import allEvents from "./data/events-all.json"
import {handleStakeSet} from "./src/KlerosLiquidMappings";
import {Court} from "./src/mocks";
import {DuneEventTx, StakeSetEventFromTxEvent} from "./src/helpers";

interface CourtValues {
    Court: string
    Jurors: number
    TotalStaked: number
    MinStake: string
    VoteStake: string
    MeanStaked: string
    MaxStaked: string
    DisputesLastMonth: number
    OpenDisputes: number
    MinStakeUSD: string
}

const courtsValues: CourtValues[] = [
    {
        "Court": "0",
        "Jurors": 782,
        "TotalStaked": 156436000,
        "MinStake": "700",
        "VoteStake": "700",
        "MeanStaked": "200,046",
        "MaxStaked": "21,001,700",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$60.69"
    },
    {
        "Court": "1",
        "Jurors": 84,
        "TotalStaked": 7755610,
        "MinStake": "2,100",
        "VoteStake": "1,050",
        "MeanStaked": "92,328",
        "MaxStaked": "1,500,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$182.08"
    },
    {
        "Court": "2",
        "Jurors": 63,
        "TotalStaked": 3517840,
        "MinStake": "2,500",
        "VoteStake": "1,250",
        "MeanStaked": "55,838",
        "MaxStaked": "700,000",
        "DisputesLastMonth": 9,
        "OpenDisputes": 2,
        "MinStakeUSD": "$216.76"
    },
    {
        "Court": "3",
        "Jurors": 9,
        "TotalStaked": 1286800,
        "MinStake": "14,000",
        "VoteStake": "7,000",
        "MeanStaked": "142,977",
        "MaxStaked": "700,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$1,213.86"
    },
    {
        "Court": "4",
        "Jurors": 16,
        "TotalStaked": 4004130,
        "MinStake": "17,000",
        "VoteStake": "8,500",
        "MeanStaked": "250,258",
        "MaxStaked": "1,500,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$1,473.97"
    },
    {
        "Court": "5",
        "Jurors": 15,
        "TotalStaked": 748654,
        "MinStake": "14,000",
        "VoteStake": "4,550",
        "MeanStaked": "49,910",
        "MaxStaked": "204,538",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$1,213.86"
    },
    {
        "Court": "6",
        "Jurors": 76,
        "TotalStaked": 1802990,
        "MinStake": "3,900",
        "VoteStake": "1,950",
        "MeanStaked": "23,723",
        "MaxStaked": "426,519",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "7",
        "Jurors": 10,
        "TotalStaked": 15869400,
        "MinStake": "14,000",
        "VoteStake": "4,550",
        "MeanStaked": "1,586,940",
        "MaxStaked": "15,127,900",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$1,213.86"
    },
    {
        "Court": "8",
        "Jurors": 210,
        "TotalStaked": 3096420,
        "MinStake": "700",
        "VoteStake": "700",
        "MeanStaked": "14,744",
        "MaxStaked": "1,000,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$60.69"
    },
    {
        "Court": "9",
        "Jurors": 43,
        "TotalStaked": 1284020,
        "MinStake": "3,100",
        "VoteStake": "1,550",
        "MeanStaked": "29,860",
        "MaxStaked": "381,476",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$268.78"
    },
    {
        "Court": "10",
        "Jurors": 26,
        "TotalStaked": 958000,
        "MinStake": "700",
        "VoteStake": "350",
        "MeanStaked": "36,846",
        "MaxStaked": "600,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$60.69"
    },
    {
        "Court": "11",
        "Jurors": 10,
        "TotalStaked": 754183,
        "MinStake": "2,200",
        "VoteStake": "1,100",
        "MeanStaked": "75,418",
        "MaxStaked": "600,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$190.75"
    },
    {
        "Court": "12",
        "Jurors": 9,
        "TotalStaked": 409983,
        "MinStake": "3,100",
        "VoteStake": "1,550",
        "MeanStaked": "45,553",
        "MaxStaked": "350,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$268.78"
    },
    {
        "Court": "13",
        "Jurors": 10,
        "TotalStaked": 50460,
        "MinStake": "3,900",
        "VoteStake": "1,560",
        "MeanStaked": "5,046",
        "MaxStaked": "16,650",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "14",
        "Jurors": 4,
        "TotalStaked": 12306,
        "MinStake": "3,900",
        "VoteStake": "1,560",
        "MeanStaked": "3,076",
        "MaxStaked": "5,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "15",
        "Jurors": 2,
        "TotalStaked": 103547,
        "MinStake": "3,900",
        "VoteStake": "1,560",
        "MeanStaked": "51,773",
        "MaxStaked": "102,051",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "16",
        "Jurors": 9,
        "TotalStaked": 90689,
        "MinStake": "3,900",
        "VoteStake": "1,560",
        "MeanStaked": "10,076",
        "MaxStaked": "76,211",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "17",
        "Jurors": 6,
        "TotalStaked": 49938,
        "MinStake": "3,900",
        "VoteStake": "1,560",
        "MeanStaked": "8,323",
        "MaxStaked": "20,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "18",
        "Jurors": 0,
        "TotalStaked": 0,
        "MinStake": "3,900",
        "VoteStake": "1,677",
        "MeanStaked": "0",
        "MaxStaked": "0",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "19",
        "Jurors": 5,
        "TotalStaked": 110701,
        "MinStake": "3,900",
        "VoteStake": "1,677",
        "MeanStaked": "22,140",
        "MaxStaked": "100,151",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "20",
        "Jurors": 3,
        "TotalStaked": 433066,
        "MinStake": "3,900",
        "VoteStake": "1,677",
        "MeanStaked": "144,355",
        "MaxStaked": "426,519",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "21",
        "Jurors": 5,
        "TotalStaked": 53157,
        "MinStake": "3,900",
        "VoteStake": "1,677",
        "MeanStaked": "10,631",
        "MaxStaked": "27,264",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$338.15"
    },
    {
        "Court": "22",
        "Jurors": 20,
        "TotalStaked": 446066,
        "MinStake": "1,700",
        "VoteStake": "1,700",
        "MeanStaked": "22,303",
        "MaxStaked": "200,000",
        "DisputesLastMonth": 0,
        "OpenDisputes": 0,
        "MinStakeUSD": "$147.40"
    },
    {
        "Court": "23",
        "Jurors": 223,
        "TotalStaked": 40177900,
        "MinStake": "1,200",
        "VoteStake": "600",
        "MeanStaked": "180,169",
        "MaxStaked": "5,272,400",
        "DisputesLastMonth": 74,
        "OpenDisputes": 28,
        "MinStakeUSD": "$104.05"
    }
]

describe('Test Court Totals', () => {
    allEvents.forEach(function(event: DuneEventTx) {
        handleStakeSet(StakeSetEventFromTxEvent(event));
    });

    courtsValues.forEach((courtValue) => {
        it(`Test court ${courtValue.Court}`, () => {
            const court = Court.load(courtValue.Court)

            let activeJurors = 0
            let tokenStaked = 0

            if (court !== null) {
                activeJurors = court.activeJurors.toI32()
                tokenStaked = court.tokenStaked.toI32()
            }

            expect(
                activeJurors,
                'Invalid activeJurors'
            ).to.equal(courtValue.Jurors);

            expect(
                Math.floor(tokenStaked * Math.pow(10, -18)),
                'Invalid tokenStaked'
            ).to.equal(courtValue.TotalStaked);
        });
    })

});
