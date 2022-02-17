import { ExtERC20 } from '@/ExtERC20';
import { RewardPoolCreatedEvent, Staking } from '@/Staking';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { expect } from 'chai';
import colors from 'colors';
import Decimal from 'decimal.js';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import {
    AccountMap,
    AccountName,
    AccountNames,
    AccountState,
    BaseTestContext,
    ElementType,
    TokenConfig
} from '../helpers/BaseTestContext';
import { compareBigNumbers, findEvent, tokenFormat } from '../helpers/utils';



export const RewardTokenNames = [ 'rewardA', 'rewardB', 'rewardC' ];
export type RewardTokenName = ElementType<typeof RewardTokenNames>;

export const TokenNames = [ 'staking', ...RewardTokenNames ];
export type TokenName = ElementType<typeof TokenNames>;

export type TokenMap<T> = {
    staking? : T,
    rewardA? : T,
    rewardB? : T,
    rewardC? : T,
};


export type RewardPool = {
    pid : number,
    rewardTokenName : RewardTokenName,
    amount : BigNumber,
    createdAt : number,
    timespan : number,
    rewardsRate : BigNumber,
};

export type RewardPoolMap<T> = {
    [pid : number] : T,
}


export type StakerState = {
    balances : TokenMap<BigNumber>,
    staked : BigNumber,
    claimableRewards : RewardPoolMap<BigNumber>,
};



export class TestContext
    extends BaseTestContext
{
    
    public tokenConfigs : TokenMap<TokenConfig> = {
        staking: {
            name: '4soft Defi Training',
            symbol: 'DST',
            initialSupply: tokenFormat(1e12),
            decimals: 18
        },
        rewardA: {
            name: '4soft Defi Reward A',
            symbol: 'DRa',
            initialSupply: tokenFormat(1e12),
            decimals: 18
        },
        rewardB: {
            name: '4soft Defi Reward B',
            symbol: 'DRb',
            initialSupply: tokenFormat(1e12),
            decimals: 18
        },
        rewardC: {
            name: '4soft Defi Reward C',
            symbol: 'DRc',
            initialSupply: tokenFormat(1e12, 18),
            decimals: 18
        }
    };
    
    public stakingContract : Staking;
    
    public tokenContracts : TokenMap<ExtERC20> = {};
    
    public accountsState : AccountMap<StakerState> = {};
    
    public rewardPools : RewardPool[] = [];
    
    
    
    public async initAccounts ()
    {
        await super.initAccounts();
        
        for (const name of AccountNames) {
            this.accountsState[name].staked = BigNumber.from(0);
            this.accountsState[name].claimableRewards = [];
        }
    }
    
    public async initStakingContract ()
    {
        this.tokenContracts.staking = await this._createToken('staking');
        
        this.stakingContract = await this._deployContract(
            'Staking',
            this.tokenContracts.staking.address
        );
    }
    
    public async initRewardTokens ()
    {
        for (const name of RewardTokenNames) {
            this.tokenContracts[name] = await this._createToken(name);
        }
    }
    
    public async verifyAccountsState (...accountNames : AccountName[])
    {
        await super.verifyAccountsState(...accountNames);
        
        for (const accountName of accountNames) {
            const account = this.accounts[accountName];
            const accountState = this.accountsState[accountName];
            
            // verify stake
            const stake = await this.stakingContract.balanceOf(account.address);
            expect(stake).to.be.equal(accountState.staked);
            
            // verify claimable rewards
            for (const [pid, rewardPool] of Object.entries(this.rewardPools)) {
                const tokenConfig = this.tokenConfigs[rewardPool.rewardTokenName];
                const decimals = Math.round(tokenConfig.decimals / 2);
                const rewards = await this.stakingContract.claimableRewardsOf(pid, account.address);
                compareBigNumbers(
                    accountState.claimableRewards[pid],
                    rewards,
                    decimals,
                    `${tokenConfig.name} claimable of ${accountName}`
                );
            }
        }
    }
    
    public async verifyShares (shares : AccountMap<number|RewardPoolMap<number>>)
    {
        for (let [ stakerName, shareRatios ] of Object.entries<number|RewardPoolMap<number>>(shares)) {
            if (!(shareRatios instanceof Object)) {
                shareRatios = <any> Object.fromEntries(
                    this.rewardPools.map((value, index) => ([ index, shareRatios ]))
                );
            }
        
            for (const [ pid, ratio ] of Object.entries(shareRatios)) {
                const rewardPool = this.rewardPools[pid];
                
                const account = this.accounts[stakerName];
                const stakerShare = await this.stakingContract.stakerShareRatio(pid, account.address);
                const currentRatio = Number(stakerShare.toString()) / 1e18;
                
                // strip some digits
                if ((currentRatio - ratio) * 1e12 > 1) {
                    const desc = `Staker: ${stakerName}`;
                    expect.fail(`Ratios didn't match\n\tE: ${ratio.toString()}\n\tA: ${currentRatio.toString()}\n${desc}`);
                }
            }
        }
    }
    
    public async createRewardPool (
        rewardTokenName : RewardTokenName,
        amount : BigNumber,
        timespan : number
    ) : Promise<RewardPool>
    {
        {
            const tx = await this.tokenContracts[rewardTokenName]
                .connect(this.ownerAccount)
                .approve(
                    this.stakingContract.address,
                    amount
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = await this.stakingContract
                .connect(this.ownerAccount)
                .createRewardsPool(
                    this.tokenContracts[rewardTokenName].address,
                    amount,
                    timespan
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const block = await ethers.provider.getBlock('latest');
            
            const event = findEvent<RewardPoolCreatedEvent>(result, 'RewardPoolCreated');
            
            const rewardPool : RewardPool = {
                pid: event.args.pid.toNumber(),
                createdAt: block.timestamp,
                amount,
                rewardsRate: amount.div(timespan),
                rewardTokenName,
                timespan,
            };
            
            this.rewardPools.push(rewardPool);
            
            for (const accountState of Object.values(this.accountsState)) {
                accountState.claimableRewards[rewardPool.pid] = BigNumber.from(0);
            }
            
            return rewardPool;
        }
    }
    
    public async stakeTokens (
        stakes : AccountMap<BigNumber>
    ): Promise<Promise<any>[]>
    {
        const promises = [];
    
        for (const [ stakerName, amount ] of Object.entries<BigNumber>(stakes)) {
            const account = this.accounts[stakerName];
            const accountState : StakerState = this.accountsState[stakerName];
            
            // approve
            {
                const tx = await this.tokenContracts.staking
                    .connect(account)
                    .approve(
                        this.stakingContract.address,
                        tokenFormat(amount)
                    );
                
                const wait = tx.wait().then(result => {
                    expect(result.status).to.be.equal(1);
                });
                promises.push(wait);
            }
            
            // stake
            {
                const tx : ContractTransaction = await this.stakingContract
                    .connect(account)
                    .stake(amount);
                
                const wait = tx.wait()
                    .then(result => {
                        expect(result.status).to.be.equal(1);
                        
                        accountState.balances.staking = accountState.balances.staking.sub(amount);
                        accountState.staked = accountState.staked.add(amount);
                    })
                    .catch(() => {
                        expect.fail(`Could not stake ${stakerName} with ${amount}`);
                    });
                promises.push(wait);
            }
        };
        
        return promises;
    }
    
    public localDistributeRewards (
        ratios : AccountMap<number|RewardPoolMap<number>>,
        time : number | RewardPoolMap<number>
    )
    {
        for (const [ stakerName, _ratios ] of Object.entries<number|RewardPoolMap<number>>(ratios)) {
            const stakerState : StakerState = this.accountsState[stakerName];
            
            for (const pid in this.rewardPools) {
                const rewardPool = this.rewardPools[pid];
                let ratio = _ratios instanceof Array
                    ? _ratios[pid]
                    : _ratios;
                
                const poolTime = time instanceof Object
                    ? time[pid]
                    : time;
                
                stakerState.claimableRewards[pid] = stakerState.claimableRewards[pid].add(
                    rewardPool.rewardsRate
                        .mul(poolTime)
                        .mul( (new Decimal(10)).pow(18).mul(ratio).toString() )
                        .div( BigNumber.from(10).pow(18) )
                );
            }
        }
    }
    
    public async displayDetails (label : string = 'details')
    {
        const block = await ethers.provider.getBlock('latest');
        
        console.log(
            colors.red('### ' + label),
        );
        
        for (const pid in this.rewardPools) {
            const rewardPoolState = await this.stakingContract.rewardPools(pid);
            console.log(colors.magenta(`Reward pool #${pid}`));
            console.log(
                `Shares:\t\t${rewardPoolState.totalShares}\n` +
                `Accmul:\t\t${rewardPoolState.accumulator}`
            );
            
            const rewardPool = this.rewardPools[pid];
            const tokenConfig = this.tokenConfigs[rewardPool.rewardTokenName];
        
            for (const [ name, account ] of Object.entries(this.accounts)) {
                const stake = await this.stakingContract.balanceOf(account.address);
                if (Number(stake.toString()) == 0) {
                    continue;
                }
                
                console.log(colors.green(`${name}`));
                console.log('\tStake\t', stake.div(tokenFormat(1, 18)).toNumber());
                
                const shareRatio = await this.stakingContract.stakerShareRatio(pid, account.address);
                const share = await this.stakingContract.stakerShare(pid, account.address);
                console.log(
                    '\tShares\t',
                    Number(share.div(BigNumber.from(10).pow(17)).toString()) / 10,
                    "\t",
                    (Number(shareRatio.div(1e12).toString()) / 1e4).toFixed(5).padStart(10, ' ') + ' %',
                );
                
                const rewards = await this.stakingContract.claimableRewardsOf(pid, account.address);
                console.log(
                    '\tRewards\t',
                    rewards.div(tokenFormat(1, tokenConfig.decimals)).toNumber()
                );
            }
        }
        
        console.log();
    }
}
