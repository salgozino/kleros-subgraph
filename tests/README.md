## Test setup

1. Copy `/src/KlerosLiquidMappings.ts` to `/tests/src/KlerosLiquidMappings.ts`
2. Delete all the imports
3. Add the following imports

```
import {
  BigInt2 as BigInt, Bytes, Address,
  StakeSet, Draw, NewPeriod, Vote, Round, Dispute, Court, KlerosCounter, Juror, CourtStake,
  KlerosLiquid,
  StakeSetEvent, AppealDecisionEvent, TokenAndETHShiftEvent, NewPeriodEvent, DrawEvent, DisputeCreationEvent,
  ChangeSubcourtTimesPerPeriodCall, ChangeSubcourtJurorFeeCall, ChangeSubcourtAlphaCall, ChangeSubcourtMinStakeCall,
  CreateSubcourtCall, CastVoteCall, ExecuteRulingCall, ChangeSubcourtJurorsForJumpCall,
} from "./mocks"

import { log } from "./log"
```