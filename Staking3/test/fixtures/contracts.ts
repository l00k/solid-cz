import { ExtERC20 } from '@/ExtERC20';
import { Staking } from '@/Staking';
import { smock } from '@defi-wonderland/smock';
import { BigNumberish } from 'ethers';
import { ethers } from 'hardhat';


export const Factory = {
    ExtERC20: async(name : string, symbol : string, initalSupply : BigNumberish, decimals : BigNumberish) => {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await ethers.getContractFactory('ExtERC20', owner);
        const contract : ExtERC20 = <any>await contractFactory.deploy(name, symbol, initalSupply, decimals);
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
