/* GRAPH TYPES */

export class BigInt2 {

    value: bigint

    constructor(number: number|bigint|string) {
        this.value = BigInt(number)
    }

    toString(): string {
        return this.value.toString()
    }

    toI32(): number {
        return parseInt(this.value.toString())
    }

    static fromI32(number: number|string) {
        return new BigInt2(number)
    }

    static fromString(string: string) {
        return new BigInt2(string)
    }

    equals(number: BigInt2): boolean {
        return this.value === number.value
    }

    notEqual(number: BigInt2): boolean {
        return this.value !== number.value
    }

    gt(number: BigInt2): boolean {
        return this.value > number.value
    }

    minus(number: BigInt2):BigInt2 {
        return new BigInt2(this.value - number.value)
    }

    plus(number: BigInt2):BigInt2 {
        return new BigInt2(this.value + number.value)
    }

}

export class Bytes {
    value: string

    constructor(string: string) {
        this.value = string
    }

    toHex() {
        return this.value
    }
}

export class Address extends Bytes {

    toHexString() {
        return this.value;
    }

    static fromString(string: string) {
        return new Address(string)
    }
}

/* ENTITIES */

export const store: {[key: string]: {[key: string]: Entity}} = {}

export class Entity {
    id: string

    constructor(id: string) {
        this.id = id
    }

    static _load(entityName: string, id: string): Entity | null {
        return store?.[entityName]?.[id] || null
    }

    save() {
        if (store[this.constructor.name] === undefined) {
            store[this.constructor.name] = {}
        }

        store[this.constructor.name][this.id] = this
    }
}

export class StakeSet extends Entity {
    address: string
    subcourtID: BigInt2
    stake: BigInt2
    newTotalStake: BigInt2

    static load(id: string): StakeSet | null {
        return super._load('StakeSet', id) as StakeSet | null
    }
}

export class Draw extends Entity {
    address: Bytes
    disputeId: BigInt2
    roundNumber: BigInt2
    voteId: BigInt2
    timestamp: BigInt2

    static load(id: string): Draw | null {
        return super._load('Draw', id) as Draw | null
    }
}

export class NewPeriod extends Entity {
    disputeId: BigInt2
    newPeriod: string

    static load(id: string): NewPeriod | null {
        return super._load('NewPeriod', id) as NewPeriod | null
    }
}

export class Vote extends Entity {
    dispute: string
    round: string
    voteID: BigInt2
    address: string
    choice: BigInt2 | null
    voted: boolean
    salt: BigInt2 | null
    timestamp: BigInt2 | null

    static load(id: string): Vote | null {
        return super._load('Vote', id) as Vote | null
    }
}

export class Round extends Entity {
    dispute: string
    votes: string[]
    winningChoice: BigInt2
    startTime: BigInt2

    static load(id: string): Round | null {
        return super._load('Round', id) as Round | null
    }
}

export class Dispute extends Entity {
    disputeID: BigInt2
    arbitrable: Bytes
    creator: string
    subcourtID: string
    numberOfChoices: BigInt2
    period: string
    startTime: BigInt2
    lastPeriodChange: BigInt2
    rounds: string[] | null
    ruled: boolean
    currentRulling: BigInt2 | null
    jurorsInvolved: string[] | null
    metaevidente: string | null
    txid: Bytes

    static load(id: string): Dispute | null {
        return super._load('Dispute', id) as Dispute | null
    }
}

export class Court extends Entity {
    subcourtID: BigInt2
    childs: string[]
    disputesNum: BigInt2
    disputesClosed: BigInt2
    disputesOngoing: BigInt2
    activeJurors: BigInt2
    tokenStaked: BigInt2
    hiddenVotes: BigInt2
    minStake: BigInt2
    alpha: BigInt2
    feeForJuror: BigInt2
    jurorsForCourtJump: BigInt2
    parent: string | null
    timePeriods: BigInt2[]

    static load(id: string): Court | null {
        return super._load('Court', id) as Court | null
    }
}

export class KlerosCounter extends Entity {
    courtsCount: BigInt2
    disputesCount: BigInt2
    openDisputes: BigInt2
    closedDisputes: BigInt2
    evidencePhaseDisputes: BigInt2
    votingPhaseDisputes: BigInt2
    appealPhaseDisputes: BigInt2
    activeJurors: BigInt2
    inactiveJurors: BigInt2
    drawnJurors: BigInt2
    tokenStaked: BigInt2
    totalETHFees: BigInt2
    totalPNKredistributed: BigInt2
    totalUSDthroughContract: BigInt2

    static load(id: string): KlerosCounter | null {
        return super._load('KlerosCounter', id) as KlerosCounter | null
    }
}

export class Juror extends Entity {
    numberOfDisputesCreated: BigInt2
    numberOfDisputesAsJuror: BigInt2
    totalStaked: BigInt2
    activeJuror: boolean
    subcourtsIDs: string[]

    static load(id: string): Juror | null {
        return super._load('Juror', id) as Juror | null
    }
}

export class CourtStake extends Entity {
    stake: BigInt2
    court: string
    timestamp: BigInt2
    blockNumber: BigInt2
    juror: string
    txid: Bytes

    static load(id: string): CourtStake | null {
        return super._load('CourtStake', id) as CourtStake | null
    }
}

/* SMART CONTRACT */

export class KlerosLiquid {
    static bind(contract: Address) {
        return {
            courts: (id: BigInt2) => {
                const courtsConfig = {
                    0: {
                        parent: new BigInt2(0),
                    },
                    1: {
                        parent: new BigInt2(0),
                    },
                    2: {
                        parent: new BigInt2(1),
                    },
                    3: {
                        parent: new BigInt2(2),
                    },
                    4: {
                        parent: new BigInt2(1),
                    },
                    5: {
                        parent: new BigInt2(0),
                    },
                    6: {
                        parent: new BigInt2(0),
                    },
                    7: {
                        parent: new BigInt2(0),
                    },
                    8: {
                        parent: new BigInt2(0),
                    },
                    9: {
                        parent: new BigInt2(0),
                    },
                    10: {
                        parent: new BigInt2(0),
                    },
                    11: {
                        parent: new BigInt2(10),
                    },
                    12: {
                        parent: new BigInt2(9),
                    },
                    13: {
                        parent: new BigInt2(6),
                    },
                    14: {
                        parent: new BigInt2(6),
                    },
                    15: {
                        parent: new BigInt2(6),
                    },
                    16: {
                        parent: new BigInt2(6),
                    },
                    17: {
                        parent: new BigInt2(6),
                    },
                    18: {
                        parent: new BigInt2(6),
                    },
                    19: {
                        parent: new BigInt2(6),
                    },
                    20: {
                        parent: new BigInt2(6),
                    },
                    21: {
                        parent: new BigInt2(6),
                    },
                    22: {
                        parent: new BigInt2(0),
                    },
                    23: {
                        parent: new BigInt2(0),
                    },
                }

                return {
                    // parentCourtID
                    value0: courtsConfig[id.toString()].parent,
                    // hiddenVotes
                    value1: new BigInt2(1),
                    // minStake
                    value2: new BigInt2(1),
                    // alpha
                    value3: new BigInt2(1),
                    // feeForJuror
                    value4: new BigInt2(1),
                    // jurorsForCourtJump
                    value5: new BigInt2(1)
                }
            },
            getSubcourt: (id: BigInt2) => {
                return {
                    // parentCourtID
                    value0: new BigInt2(1),
                    // timePeriods
                    value1: [new BigInt2(1)],
                }
            },
            disputes: (disputeId: BigInt2) => {
                return {
                    value0: new BigInt2(1),
                    value1: new Address(''),
                    value2: new BigInt2(1),
                    value3: new BigInt2(1).toI32(),
                    value4: new BigInt2(1),
                    value5: new BigInt2(1),
                    value6: new BigInt2(1),
                    value7: true,
                }
            },
            try_getVoteCounter: (disputeID: BigInt2, round: BigInt2) => {
                return {
                    reverted: false,
                    value: {
                        value0: new BigInt2(1),
                        value1: [new BigInt2(1),new BigInt2(1)],
                        value2: true,
                    }
                }
            },
            try_currentRuling: (disputeID: BigInt2) => {
                return {
                    reverted: false,
                    value: new BigInt2(1)
                }
            }
        }
    }
}

/* EVENTS */

class BaseEvent {
    address: Address
    logIndex: BigInt2
    transactionLogIndex: BigInt2
    logType: null
    transaction: Transaction
    block: Block
}

export class StakeSetEvent extends BaseEvent {
    address: Address
    params: {
        _address: Address
        _subcourtID: BigInt2
        _stake: BigInt2
        _newTotalStake: BigInt2
    }
}

export class AppealDecisionEvent extends BaseEvent {
    params: {
        _disputeID: BigInt2
    }
}

export class TokenAndETHShiftEvent extends BaseEvent {
    params: {

    }
}

export class NewPeriodEvent extends BaseEvent {
    params: {
        _disputeID: BigInt2
        _period: number
    }
}

export class DrawEvent extends BaseEvent {
    address: Address
    params: {
        _disputeID: BigInt2
        _appeal: BigInt2
        _voteID: BigInt2
        _address: Address
    }
}

export class DisputeCreationEvent extends BaseEvent {
    params: {
        _disputeID: BigInt2
        _arbitrable: Bytes
    }
}

/* CALLS */
class BaseCall {
    to: Address
    from: Address
    block: Block
    transaction: Transaction
}

export class ChangeSubcourtTimesPerPeriodCall extends BaseCall {
    inputs: {
        _subcourtID: BigInt2
        _timesPerPeriod: BigInt2[]
    }
}

export class ChangeSubcourtJurorsForJumpCall extends BaseCall {
    inputs: {
        _subcourtID: BigInt2
        _jurorsForCourtJump: BigInt2
    }
}

export class ChangeSubcourtJurorFeeCall extends BaseCall {
    inputs: {
        _subcourtID: BigInt2
        _feeForJuror: BigInt2
    }
}

export class ChangeSubcourtAlphaCall extends BaseCall {
    inputs: {
        _subcourtID: BigInt2
        _alpha: BigInt2
    }
}

export class ChangeSubcourtMinStakeCall extends BaseCall {
    inputs: {
        _subcourtID: BigInt2
        _minStake: BigInt2
    }
}

export class CreateSubcourtCall extends BaseCall {
    inputs: {

    }
}

export class CastVoteCall extends BaseCall {
    inputs: {
        _disputeID: BigInt2
        _voteIDs: BigInt2[]
        _choice: BigInt2
        _salt: BigInt2
    }
}


export class ExecuteRulingCall extends BaseCall {

}

/* ETHEREUM */

export class Transaction {
    hash: Bytes
    from: Address

    constructor(hash: string, from: string) {
        this.hash = new Bytes(hash)
        this.from = Address.fromString(from)
    }
}

export class Block {
    timestamp: BigInt2
    number: BigInt2

    constructor(timestamp: BigInt2, number: BigInt2) {
        this.timestamp = timestamp
        this.number = number
    }
}