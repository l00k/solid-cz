import { Coin } from '@/Coin';
import { Staking } from '@/Staking';
import { smock } from '@defi-wonderland/smock';
import { BigNumberish } from 'ethers';
import { ethers } from 'hardhat';


export const Factory = {
    Coin: async(name : string, symbol : string, initalSupply : BigNumberish, decimals : BigNumberish) => {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await ethers.getContractFactory('Coin', owner);
        const contract : Coin = <any>await contractFactory.deploy(name, symbol, initalSupply, decimals);
        await contract.deployed();
        
        return contract;
    },
    Staking: async(...args : any[]) => {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await smock.mock('Staking', owner);
        const contract : Staking = <any>await contractFactory.deploy(...args);
        await contract.deployed();
        
        return contract;
    }
};
