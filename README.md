# Klerosboard Graph
This is the repo where you could find the backend of klerosboard. The aim of this graph deployed in thegrap.com is to track the evolution and transactions in the Kleros Courts.

## Content
[] means not implmented; 
[!] means implemented but with bugs or not reviewed; 
[x] means already implemented;

### Global counters (KlerosCounter)
The graph have global counters to track different properties and metrics of interest of all the courts. This counters are:
[x] Courts count

[x] Total disputes raised (disputesCount)

[!] Total disputes without ruling (openDisputes)

[!] Total disputes on evidence phase (evidencePhaseDisputes)

[!] Total disputes on voting phase (votingPhaseDisputes)

[!] Total disputes on appeal phase (appealPhaseDisputes)

[!] Total disputes closed (closedDisputes)

[!] Count of Active jurors (wallets)

[!] Count of inactive jurors (wallets)

[!] Total jurors drawn (drawnJurors)

[!] PNK staked in the all the courts (tokenStaked)

[] Total ETH distributed as fees

[] Total PNK redistributed within jurors

[] Total USD passed through the contract (in deposits and jurors fees).

### Court
Each court is an entity, where different metrics are stored.
[x] subcourtID

[!] Number of Disputes raised in this court (disputesNum)

[!] Number of Disputes already closed (disputesClosed)

[!] Number of Disputes ongoing (disputesOngoing)

[x] List of all the disputes

[x] List of all the jurors in this court

[x] Court childs

[x] Court parent

[x] policy

[!] Number of Active Jurors (considering all the court childs)

[!] PNK Staked (considering all the court childs).

[x] hiddenVotes (if the options it's activated in this court)

[x] Min Stake (PNK)

[x] Fee for Jurors

[x] Time periods (amount of seconds for each period)

[x] alpha

[x] jurorsForCourtJump

[] Fees already paid

[] PNK redistributed

### Dispute
Each dispute entity has it own metrics and data.
[x] Dispute Number (ID)

[x] Arbitrable (The SC who raised the dispute)

[x] Creator (wallet who raised the dispute)

[x] txID: transaction where the dispute was created

[x] Number of choices

[x] Last period change

[x] period: Current period if this dispute

[x] startTime: timestamp where the dispute was raised

[x] ruled

[x] Rounds

[x] Current Rulling

[x] Jurors involved

[] Metaevidence (metaevidence of the dispute. Question, options)

### Round
Each round is an entity
[x] Dispute associated

[x] Votes

[!] Round rulling

[x] Round start time

### Vote
Each vote has it's own entity
[x] Dispute

[x] Round

[x] voteID

[x] Juror

[x] Choice

[x] voted

[x] salt

[x] timestamp of the vote

### Juror/Challenger
[x] ID (address)

[x] subcourts id where has stake or staked

[x] total staked

[x] Current Stakes (list of CourtStake entities of this juror)

[x] active juror  (if has PNK staked or not)

[x] disputes as juror

[!] Number of disputes as juror

[x] disputes created

[!] Number of disputes created

[x] votes (list of all the votes)

### Court Stake
This is an extra entity useful to track the last stake event of each juror in each court. The ID it's wallet-courtID
[x] Court

[x] Juror

[x] stake

[x] timestamp

[x] blocknumber

[x] txID


## Other entities related to the SC events, and used as auxiliaries
### setStake
[x] juror address

[x] subcourt

[x] stake amount

[x] newtotalStakeAmount

### NewPeriod
[x] disputeID

[x] newPeriod

### draw
[x] address

[x] disputeID

[x] roundNumber

[x] voteID
### TokenAndETHShift
[] address

[] disputeID

[] tokenAmount

[] ETHAmount

### PolicyUpdate
[x] id: the court 

[x] subcourtID

[x] policy

[x] contractAddress

[x] timestamp: BigInt! # uint256

[x] blockNumber: BigInt! # unit256

## Smart Contracts
All the tracking of this grpah will be done checking the events of the KlerosLiquid smart contract, and the Policy Registry contract.
 - Kleros Liquid SC is deployed at [0x988b...8069](etherscan.com/address/0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069)

 - PolicyRegistry is deployed at [0xCf1f...ECe4](etherscan.com/address/0xCf1f07713d5193FaE5c1653C9f61953D048BECe4).

### Kleros Liquid events of interest:
#### setStake 
When a juror stake or unstake pnk in some court. This event returns the current stake and the total current stake (total is the stake of the juror in all the subcourts).
When this event is emmited, some entities should be created/updated. First of all, there is a setStake entity that will record this event, to have all the history of all the stakes. Then, a CourtStake entity should be created or updated. This entity has the last setStake event of this juror in this specific court. In addition of this, some counters has to be updated. Each court has it's own counter of active jurors, so if this is a new juror, the active juror count of this court has to be increased by one, if the juror it's unstaking from the court, the counter should be decreased. This counter has to impact in all the parent courts also. Each court has a counter of the amount of tokens staked, this has to be updated and also in the parent courts. Last, the global counter (KlerosCounters) shall be updated if it's needed to take into account if this jurors it's a new active juror or it's a new inactive juror.

### newPeriod
When a dispute changes to a new period. The posible phases are: {0:evidence, 1:commit, 2:vote, 3:appeal, 4:execution}.
__[MORE INFO NEEDED HERE]__

### AppealDecisionEvent
Event  raised when a dispute is appealed
__[MORE INFO NEEDED HERE]__

### draw
Emitted when a jurors is drawn in a case. A draw entity it's created, but also a vote entity. This vote entity will track when a juror cast a vote.

### TokenAndETHShift
Emmited when a juror win or lose tokens and ETH from the case.
__not implemented yet__

## KlerosLiquid functions calls of interest:
### createSubcourt
Besides is not the best performance to track functions calls, is the only way to track the creation of a new subcourt. Also the courts could be created when a dispute it's created and the court it's not in the subgraph yet (due to colision events between createSubcourt call and createDispute events). This it's more a subgraph technisism rather than a blockchain issue. In the practice you can not raise a dispute in a court that doesn't exist, but for how the subgraph read the blockchain, this situation can be raised.
###  ChangeSubcourtTimesPerPeriodCall
Change the timesPerPeriod field of a court
### ChangeSubcourtJurorsForJumpCall
Change the jurorsForJump field of a court
### ChangeSubcourtJurorFeeCall
Change the JurorFee field of a court
### ChangeSubcourtAlphaCall
Change the alpha field in a court
### ChangeSubcourtMinStakeCall
Change the minStake field in a court

## PolicyUpdate
Emitted when a policy is updated. Has the subcourtID and the policy.A policyUpdate entity it's created to store this event. If it's the first policy for this court, the entity should be created, if not, just the policy and other fields should be updated. In addition, the court entity should be updated so the last policy is linked.



